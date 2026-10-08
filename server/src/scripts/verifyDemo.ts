import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import {
  describeFailure,
  fileCredentialStore,
  runVerify,
  type DemoTarget,
  type SmokeServer
} from "../utils/demoProvisioning.js";

/**
 * DEMO-DB-001 read-only verification of the provisioned demo database.
 *
 *   npm run demo:verify -- --expected-host <host>
 *
 * Loads only DATABASE_URL from .env.neon.local (never the inherited
 * environment) and scratch/neon-demo/accounts.json, checks the
 * live record shape and bcrypt hashes, then mounts the real auth and bootstrap
 * routers on an ephemeral 127.0.0.1 server and signs in as every demo
 * account. It does not start the application (no sockets, delay monitor,
 * telemetry, AI or notifications) and writes nothing. Output is check names
 * with PASS/FAIL only.
 */

const root = process.cwd();

async function connect(target: DemoTarget) {
  // Set before the dynamic imports below: the routers read env at import time.
  // Only the target database; throwaway JWT secrets; AI disabled.
  process.env.DATABASE_URL = target.url;
  process.env.NODE_ENV = "test";
  process.env.OPENAI_API_KEY = "";
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  process.env.JWT_REFRESH_SECRET = randomBytes(32).toString("hex");

  const { PrismaClient, Prisma } = await import("@prisma/client");
  const db = new PrismaClient({ datasourceUrl: target.url, log: [] });
  // server/src/db.ts reuses a global client instead of constructing its own.
  (globalThis as unknown as { prisma?: typeof db }).prisma = db;

  const startSmokeServer = async (): Promise<SmokeServer> => {
    const express = (await import("express")).default;
    const { ZodError } = await import("zod");
    const { HttpError } = await import("../utils/http.js");
    const authRouter = (await import("../routes/auth.js")).default;
    const bootstrapRouter = (await import("../routes/bootstrap.js")).default;

    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
    app.use("/api", bootstrapRouter);
    // Mirrors the status codes of server/src/index.ts without echoing details.
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError) return res.status(400).json({ error: { message: "Validation failed" } });
      if (error instanceof Prisma.PrismaClientKnownRequestError) return res.status(400).json({ error: { message: "Request failed" } });
      if (error instanceof HttpError) return res.status(error.status).json({ error: { message: error.message } });
      return res.status(500).json({ error: { message: "Internal server error" } });
    });

    const server = await new Promise<Server>((resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
      listening.on("error", reject);
    });
    const { port } = server.address() as AddressInfo;

    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        })
    };
  };

  return { db, startSmokeServer };
}

runVerify(process.argv.slice(2), {
  root,
  credentialStore: fileCredentialStore(root),
  connect,
  fetch: (url, init) => fetch(url, init),
  log: (line) => console.log(line)
}).then(
  () => {
    process.exitCode = 0;
  },
  (error: unknown) => {
    const failure = describeFailure(error);
    console.error(`FAILED [${failure.reason}] ${failure.message}`);
    process.exitCode = 1;
  }
);
