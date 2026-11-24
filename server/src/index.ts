import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "./env.js";
import { prisma } from "./db.js";
import authRouter from "./routes/auth.js";
import eventsRouter from "./routes/events.js";
import driversRouter from "./routes/drivers.js";
import tasksRouter from "./routes/tasks.js";
import suppliersRouter from "./routes/suppliers.js";
import bookingsRouter from "./routes/bookings.js";
import aiRouter from "./routes/ai.js";
import notificationsRouter from "./routes/notifications.js";
import bootstrapRouter from "./routes/bootstrap.js";
import operationsRouter from "./routes/operations.js";
import uploadsRouter from "./routes/uploads.js";
import communicationsRouter from "./routes/communications.js";
import usersRouter from "./routes/users.js";
import auditLogsRouter from "./routes/auditLogs.js";
import ridersRouter from "./routes/riders.js";
import messagesRouter from "./routes/messages.js";
import { legacyWorkspaceBoundary } from "./utils/legacyWorkspaceBoundary.js";
import { requireAuth } from "./middleware/auth.js";
import workspaceRouter from "./routes/workspace.js";
import demoRouter from "./routes/demo.js";
import { HttpError } from "./utils/http.js";
import { startDelayMonitor } from "./services/delayMonitor.js";
import { telemetryBuffer } from "./services/telemetryBuffer.js";
import { configureRealtime } from "./services/socketAuthorization.js";
import { flushErrorReporting, initErrorReporting, reportError } from "./services/errorReporting.js";
import type { AuthRequest } from "./types/auth.js";

initErrorReporting();

const app = express();
// Trust exactly the reverse-proxy hops Render puts in front of us (TRUST_PROXY_HOPS,
// default 1) so req.ip is the real client for rate limiters and audit logs while a
// client-supplied X-Forwarded-For prefix can never be trusted. Never use `true`.
app.set("trust proxy", env.TRUST_PROXY_HOPS);
const server = http.createServer(app);
const allowedOrigins = env.CLIENT_ORIGIN.split(",").map((origin) =>
  origin.trim()
);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

app.set("io", io);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
// PLAN_READY_1 Sprint 2: unauthenticated express.static("/uploads") removed so
// visas, tickets, guest IDs, and reports are only reachable via RBAC-checked or
// short-lived signed URLs (/api/file-assets/:id/content).

mount("/auth", authRouter);
mount("/events", eventsRouter);
mount("/drivers", driversRouter);
mount("/tasks", tasksRouter);
mount("/suppliers", suppliersRouter);
mount("/bookings", bookingsRouter);
mount("/ai", aiRouter);
mount("/notifications", notificationsRouter);
mount("/users", usersRouter);
mount("/audit-logs", auditLogsRouter);
mount("/riders", ridersRouter);
mount("/messages", messagesRouter);
// FULL-OVERHAUL-M2: organization/event workspace (same authenticated router).
mount("/workspace", workspaceRouter);
// SIX-TASKS #6: investor demo (404 unless DEMO_MODE_ENABLED=true).
app.use("/api/demo", demoRouter);
app.use(["/api/bootstrap", "/bootstrap"], requireAuth, legacyWorkspaceBoundary);
app.use("/api", bootstrapRouter);
app.use("/", bootstrapRouter);
app.use("/api", legacyWorkspaceBoundary, operationsRouter);
app.use("/api", uploadsRouter);
app.use("/api", communicationsRouter);

// Handshake authentication and authorized rooms/telemetry (T-09).
configureRealtime(io);

if (env.NODE_ENV === "production") {
  const clientDist = path.resolve(process.cwd(), "client/dist");

  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }
}

app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found"));
});

app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          message: "Validation failed",
          issues: error.flatten()
        }
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return res.status(400).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
    }

    if (error instanceof HttpError) {
      if (error.status >= 500) {
        reportError(error, {
          method: req.method,
          path: req.path,
          userId: (req as AuthRequest).user?.id
        });
      }
      return res.status(error.status).json({
        error: { message: error.message }
      });
    }

    console.error(error);
    reportError(error, {
      method: req.method,
      path: req.path,
      userId: (req as AuthRequest).user?.id
    });

    return res.status(500).json({
      error: { message: "Internal server error" }
    });
  }
);

const stopDelayMonitor = startDelayMonitor(io);

server.listen(env.PORT, () => {
  console.log(`Midyaf API listening on http://localhost:${env.PORT}`);
  console.log("Socket.IO realtime layer ready.");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  reportError(reason, { path: "process:unhandledRejection" });
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  stopDelayMonitor();
  await telemetryBuffer.stop();
  await flushErrorReporting(2000);
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

function mount(pathname: string, router: express.Router) {
  const handlers = ["/auth", "/workspace"].includes(pathname) ? [router] : [requireAuth, legacyWorkspaceBoundary, router];
  app.use(`/api${pathname}`, ...handlers);
  app.use(pathname, ...handlers);
}
