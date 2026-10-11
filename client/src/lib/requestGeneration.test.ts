import { describe, expect, it } from "vitest";
import { allCurrent, createRequestGeneration } from "./requestGeneration";

/** OPS-COLLAB-001 correction R3: stale async results never paint. */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createRequestGeneration", () => {
  it("lets only the latest request apply when replies arrive in reverse order", async () => {
    const generation = createRequestGeneration();
    const applied: string[] = [];
    const run = async (label: string, reply: Promise<string>) => {
      const current = generation.begin();
      const value = await reply;
      if (current()) applied.push(`${label}:${value}`);
    };

    const a = deferred<string>();
    const b = deferred<string>();
    const first = run("A", a.promise);
    const second = run("B", b.promise);
    b.resolve("fresh");
    await second;
    a.resolve("stale");
    await first;
    expect(applied).toEqual(["B:fresh"]);
  });

  it("drops in-flight results after invalidate (resource switch, logout, unmount)", async () => {
    const generation = createRequestGeneration();
    const reply = deferred<string>();
    const current = generation.begin();
    generation.invalidate();
    reply.resolve("late");
    await reply.promise;
    expect(current()).toBe(false);
  });

  it("captures a scope without superseding requests already running", () => {
    const generation = createRequestGeneration();
    const load = generation.begin();
    const scope = generation.capture();
    expect(load()).toBe(true);
    expect(scope()).toBe(true);
    generation.invalidate();
    expect(scope()).toBe(false);
    expect(generation.capture()()).toBe(true);
  });

  it("combines checks so every scope must still hold", () => {
    const session = createRequestGeneration();
    const loads = createRequestGeneration();
    const current = allCurrent(session.capture(), loads.begin());
    expect(current()).toBe(true);
    session.invalidate();
    expect(current()).toBe(false);
  });
});
