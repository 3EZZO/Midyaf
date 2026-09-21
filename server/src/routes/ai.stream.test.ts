import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Role } from "@prisma/client";
import { signTokens } from "../middleware/auth.js";
import { streamChatCompletion } from "../services/ai.js";
import aiRouter from "./ai.js";

/**
 * Runs without OPENAI_API_KEY, which is exactly the keyless path the demo
 * relies on: the deterministic reply is replayed as SSE frames.
 */

describe("streamChatCompletion (keyless replay)", () => {
  it("yields meta first, then deltas that concatenate to the full reply, then done", async () => {
    const events = [];
    for await (const evt of streamChatCompletion({
      message: "Where is my driver?",
      language: "en",
      persona: "Noura"
    })) {
      events.push(evt);
    }
    expect(events[0].type).toBe("meta");
    expect(events[0].type === "meta" && events[0].meta.source).toBe("local");
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    const deltas = events
      .filter((e) => e.type === "delta")
      .map((e) => (e.type === "delta" ? e.delta : ""));
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.join("")).toBe(last.type === "done" ? last.content : "");
  });

  it("stops early when the signal aborts", async () => {
    const controller = new AbortController();
    let deltas = 0;
    for await (const evt of streamChatCompletion(
      { message: "Where is my driver?", language: "en" },
      controller.signal
    )) {
      if (evt.type === "delta" && ++deltas === 2) controller.abort();
    }
    expect(deltas).toBe(2);
  });
});

describe("POST /ai/chat/stream", () => {
  let server: Server;
  let base = "";
  const { accessToken } = signTokens({
    id: "user_test",
    email: "ops@midyaf.local",
    role: Role.LOGISTICS_MANAGER
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use("/ai", aiRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("streams text/event-stream frames with meta, deltas and done", async () => {
    const res = await fetch(`${base}/ai/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        message: "Triple-Key Vault status",
        language: "ar",
        persona: "Ops Manager"
      })
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const raw = await res.text();
    const frames = raw.split("\n\n").filter(Boolean);
    expect(frames[0]).toMatch(/^event: meta\ndata: /);
    expect(frames[frames.length - 1]).toMatch(/^event: done\ndata: /);

    const deltas = frames
      .filter((f) => f.startsWith("data: "))
      .map((f) => (JSON.parse(f.slice(6)) as { delta: string }).delta);
    const done = JSON.parse(
      frames[frames.length - 1].replace(/^event: done\ndata: /, "")
    ) as { content: string };
    expect(deltas.join("")).toBe(done.content);
    // Arabic reply for an Arabic request.
    expect(done.content).toMatch(/[؀-ۿ]/);
  });

  it("rejects without a bearer token", async () => {
    const res = await fetch(`${base}/ai/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" })
    });
    expect(res.status).toBe(401);
  });
});
