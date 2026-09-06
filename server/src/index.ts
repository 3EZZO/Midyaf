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
import { HttpError } from "./utils/http.js";
import { startDelayMonitor } from "./services/delayMonitor.js";
import { telemetryBuffer } from "./services/telemetryBuffer.js";
import { geofenceEngine } from "./services/geofenceEngine.js";

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
mount("/riders", ridersRouter);
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

  socket.on("driver:join", (driverId: string) => {
    socket.join(`driver:${driverId}`);
  });

  socket.on("organizer:join", () => {
    socket.join("organizers");
  });

  const processTelemetryIngestion = (res: NonNullable<ReturnType<typeof telemetryBuffer.ingest>>) => {
    const eventRoom = res.frame.eventId ? `event:${res.frame.eventId}` : "organizers";

    // Broadcast compact telemetry stream to war room & live clients
    io.to(eventRoom).emit("driver:telemetry_stream", res.packed);
    io.to("organizers").emit("driver:telemetry_stream", res.packed);

    // If significant movement or status change, broadcast formatted payload
    if (res.shouldBroadcast) {
      const formatted = {
        driverId: res.frame.driverId,
        lat: res.frame.lat,
        lng: res.frame.lng,
        speed: res.frame.speed,
        heading: res.frame.heading,
        altitude: res.frame.altitude,
        accuracy: res.frame.accuracy,
        status: res.frame.status,
        eventId: res.frame.eventId,
        timestamp: new Date(res.frame.timestamp).toISOString()
      };
      io.to(eventRoom).emit("driver:location_update", formatted);
      io.to("organizers").emit("driver:location_update", formatted);
    }

    // Evaluate concentric geofences in-memory (< 1ms)
    const transitions = geofenceEngine.evaluateTelemetry({
      driverId: res.frame.driverId,
      lat: res.frame.lat,
      lng: res.frame.lng,
      speed: res.frame.speed,
      heading: res.frame.heading,
      eventId: res.frame.eventId
    });

    if (transitions.length > 0) {
      for (const tr of transitions) {
        io.to(eventRoom).emit("geofence:transition", tr);
        io.to("organizers").emit("geofence:transition", tr);
        io.to(`driver:${res.frame.driverId}`).emit("geofence:transition", tr);
      }
    }
  };

  socket.on("driver:location_update", (payload) => {
    const res = telemetryBuffer.ingest(payload);
    if (!res) return;
    processTelemetryIngestion(res);
  });

  socket.on("driver:telemetry_stream", (packedPayload) => {
    const res = telemetryBuffer.ingest(packedPayload);
    if (!res) return;
    processTelemetryIngestion(res);
  });


  socket.on("user:location_update", (payload) => {
    io.to("organizers").emit("user:location_update", payload);
    if (payload?.eventId) {
      io.to(`event:${payload.eventId}`).emit("user:location_update", payload);
    }
    if (payload?.driverId && typeof payload?.lat === "number" && typeof payload?.lng === "number") {
      telemetryBuffer.ingest({
        driverId: payload.driverId,
        lat: payload.lat,
        lng: payload.lng,
        speed: payload.speed || 0,
        heading: payload.heading || 0,
        eventId: payload.eventId
      });
    }
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
  await telemetryBuffer.stop();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

function mount(pathname: string, router: express.Router) {
  app.use(`/api${pathname}`, router);
  app.use(pathname, router);
}
