import express from "express";
import type { NextFunction, Request, Response, Router } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Prisma, type Role } from "@prisma/client";
import { ZodError } from "zod";
import { signTokens } from "../middleware/auth.js";
import { HttpError } from "../utils/http.js";

/**
 * Test-only HTTP harness: mounts real routers like server/src/index.ts
 * (including the same error handler) on an ephemeral port, with a recording
 * Socket.IO stand-in.
 */

export type Emitted = { room: string; event: string; payload: unknown };

export type HttpResult = { status: number; body: any };

export async function startHarness(mounts: Array<[string, Router]>) {
  const app = express();
  const emitted: Emitted[] = [];
  app.set("io", {
    emit: (event: string, payload: unknown) => emitted.push({ room: "*", event, payload }),
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => emitted.push({ room, event, payload })
    })
  });
  app.use(express.json());
  for (const [path, router] of mounts) app.use(path, router);
  app.use((_req, _res, next) => next(new HttpError(404, "Route not found")));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: { message: "Validation failed", issues: error.flatten() } });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({ error: { message: error.message, code: error.code } });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { message: error.message } });
      return;
    }
    if (process.env.HARNESS_LOG_ERRORS) console.error(error);
    res.status(500).json({ error: { message: "Internal server error" } });
  });

  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  async function call(
    method: string,
    path: string,
    actor?: { id: string; role: Role },
    body?: unknown
  ): Promise<HttpResult> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (actor) {
      headers.Authorization = `Bearer ${
        signTokens({ id: actor.id, email: `${actor.id}@example.test`, role: actor.role }).accessToken
      }`;
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  return {
    emitted,
    get: (path: string, actor?: { id: string; role: Role }) => call("GET", path, actor),
    post: (path: string, actor?: { id: string; role: Role }, body?: unknown) =>
      call("POST", path, actor, body ?? {}),
    put: (path: string, actor?: { id: string; role: Role }, body?: unknown) =>
      call("PUT", path, actor, body ?? {}),
    del: (path: string, actor?: { id: string; role: Role }) => call("DELETE", path, actor),
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;
