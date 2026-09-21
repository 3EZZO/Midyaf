import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAiChat, streamAiReply, streamLocalReply } from "./aiStream";

/** A Response whose body emits the given SSE frames in the given byte chunks. */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    }
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" }
  });
}

const body = { message: "hi", language: "en", persona: "Noura" as const };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("streamAiChat", () => {
  it("parses meta, deltas and done across arbitrary chunk boundaries", async () => {
    const frames =
      'event: meta\ndata: {"persona":"Noura","source":"openai","actions":[]}\n\n' +
      'data: {"delta":"Hel"}\n\n' +
      'data: {"delta":"lo "}\n\n' +
      'data: {"delta":"world"}\n\n' +
      'event: done\ndata: {"content":"Hello world"}\n\n';
    // Split mid-frame and mid-multibyte-safe (ASCII here) to exercise buffering.
    const chunks = [
      frames.slice(0, 30),
      frames.slice(30, 95),
      frames.slice(95)
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse(chunks));

    const deltas: string[] = [];
    let meta: unknown = null;
    const result = await streamAiChat("tok", body, {
      onMeta: (m) => (meta = m),
      onDelta: (d) => deltas.push(d)
    });

    expect(meta).toMatchObject({ persona: "Noura", source: "openai" });
    expect(deltas.join("")).toBe("Hello world");
    expect(result.text).toBe("Hello world");
    expect(result.aborted).toBe(false);
  });

  it("tolerates CRLF frame separators from proxies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse(['data: {"delta":"a"}\r\n\r\ndata: {"delta":"b"}\r\n\r\n'])
    );
    const result = await streamAiChat("tok", body, { onDelta: () => {} });
    expect(result.text).toBe("ab");
  });

  it("fills in text the done frame carries that no delta did", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        'data: {"delta":"par"}\n\n',
        'event: done\ndata: {"content":"partial+tail"}\n\n'
      ])
    );
    const result = await streamAiChat("tok", body, { onDelta: () => {} });
    expect(result.text).toBe("partial+tail");
  });

  it("throws on a non-2xx so the caller can fall back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(sseResponse([], 503));
    await expect(
      streamAiChat("tok", body, { onDelta: () => {} })
    ).rejects.toThrow("stream_http_503");
  });
});

describe("streamLocalReply", () => {
  it("emits the whole text in order at the configured cadence and can be aborted", async () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const controller = new AbortController();
    const p = streamLocalReply(
      "abcdefghij",
      { persona: "Noura", source: "local" },
      { onDelta: (d) => out.push(d) },
      controller.signal,
      1
    );
    await vi.advanceTimersByTimeAsync(3 * 2); // two ticks → 6 chars
    expect(out.join("")).toBe("abcdefghi"); // first tick is synchronous: 3 + 2×3
    controller.abort();
    await vi.advanceTimersByTimeAsync(50);
    const result = await p;
    expect(result.aborted).toBe(true);
    expect(result.text).toBe(out.join(""));
    expect(result.text.length).toBeLessThan(10);
  });
});

describe("streamAiReply", () => {
  it("replays the local reply when there is no session", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    let text = "";
    const p = streamAiReply(
      undefined,
      { ...body, message: "Where is my driver?" },
      { onDelta: (_d, t) => (text = t) }
    );
    await vi.runAllTimersAsync();
    const result = await p;
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.meta?.source).toBe("local");
    expect(result.text.length).toBeGreaterThan(20);
    expect(result.text).toBe(text);
  });

  it("falls back to the local reply when the server fails before the first token", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch")
    );
    const p = streamAiReply("tok", body, { onDelta: () => {} });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.meta?.source).toBe("local");
    expect(result.aborted).toBe(false);
  });

  it("keeps a clean partial when the server drops mid-stream", async () => {
    const encoder = new TextEncoder();
    // Pull-based: the delta is delivered on the first read, the drop on the second.
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0)
          controller.enqueue(encoder.encode('data: {"delta":"half "}\n\n'));
        else controller.error(new Error("socket hang up"));
      }
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, { status: 200 })
    );
    const result = await streamAiReply("tok", body, { onDelta: () => {} });
    expect(result.text).toBe("half ");
    expect(result.meta).toBeNull();
  });
});
