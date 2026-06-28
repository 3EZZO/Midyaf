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
import { HttpError } from "./utils/http.js";
import { startDelayMonitor } from "./services/delayMonitor.js";

const app = express();
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
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

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
app.use("/api", bootstrapRouter);
app.use("/", bootstrapRouter);
app.use("/api", operationsRouter);
app.use("/api", uploadsRouter);
app.use("/api", communicationsRouter);

io.on("connection", (socket) => {
  socket.on("event:join", (eventId: string) => {
    socket.join(`event:${eventId}`);
  });

  socket.on("user:join", (userId: string) => {
    socket.join(`user:${userId}`);
  });

  socket.on("organizer:join", () => {
    socket.join("organizers");
  });

  socket.on("driver:location_update", (payload) => {
    const eventRoom = payload?.eventId ? `event:${payload.eventId}` : "organizers";
    io.to(eventRoom).emit("driver:location_update", payload);
  });

  socket.on("task:status_change", (payload) => {
    if (payload?.eventId) {
      io.to(`event:${payload.eventId}`).emit("task:status_change", payload);
    }

    if (payload?.guestUserId) {
      io.to(`user:${payload.guestUserId}`).emit("task:status_change", payload);
    }
  });

  socket.on("guest:arrived", (payload) => {
    if (payload?.eventId) {
      io.to(`event:${payload.eventId}`).emit("guest:arrived", payload);
    }
  });

  socket.on("alert:delay", (payload) => {
    if (payload?.eventId) {
      io.to(`event:${payload.eventId}`).emit("alert:delay", payload);
    }
  });
});

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
    _req: express.Request,
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
      return res.status(error.status).json({
        error: { message: error.message }
      });
    }

    console.error(error);

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

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  stopDelayMonitor();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

function mount(pathname: string, router: express.Router) {
  app.use(`/api${pathname}`, router);
  app.use(pathname, router);
}
