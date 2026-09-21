import { localAiReply } from "./localAiReply";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type AiAction = { label: string; labelAr: string; actionId: string };

export type AiStreamMeta = {
  persona: string;
  toolIntent?: string;
  actions?: AiAction[];
  data?: unknown;
  source: "openai" | "local";
};

export type AiStreamHandlers = {
  onMeta?: (meta: AiStreamMeta) => void;
  onDelta: (delta: string, text: string) => void;
};

export type AiStreamRequest = {
  message: string;
  language: string;
  persona:
    | "Saud"
    | "Noura"
    | "Saif & Munirah"
    | "Ops Manager"
    | "Supply Chain AI";
  context?: unknown;
};

export type AiStreamResult = {
  text: string;
  meta: AiStreamMeta | null;
  aborted: boolean;
};

/**
 * Reads `POST /ai/chat/stream` as server-sent events. EventSource cannot
 * POST or carry the bearer token, so this is `fetch` + a `ReadableStream`
 * reader. Aborting the signal stops the read and resolves with whatever text
 * has arrived — a clean partial, never a throw.
 */
export async function streamAiChat(
  accessToken: string,
  body: AiStreamRequest,
  handlers: AiStreamHandlers,
  signal?: AbortSignal
): Promise<AiStreamResult> {
  const response = await fetch(`${API_BASE}/ai/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok || !response.body) {
    throw new Error(`stream_http_${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let meta: AiStreamMeta | null = null;
  let aborted = false;

  const handleFrame = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:"))
        dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    let payload: unknown;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    if (event === "meta") {
      meta = payload as AiStreamMeta;
      handlers.onMeta?.(meta);
    } else if (event === "message") {
      const delta = (payload as { delta?: string }).delta ?? "";
      if (!delta) return;
      text += delta;
      handlers.onDelta(delta, text);
    } else if (event === "done") {
      const full = (payload as { content?: string }).content;
      if (typeof full === "string" && full.length > text.length) {
        const missing = full.slice(text.length);
        text = full;
        handlers.onDelta(missing, text);
      }
    } else if (event === "error") {
      throw new Error(
        (payload as { message?: string }).message ?? "stream_failed"
      );
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      // Frames are separated by a blank line; tolerate CRLF from proxies.
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const frame = buffer.slice(0, idx).replace(/\r/g, "");
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        handleFrame(frame);
      }
    }
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError" || signal?.aborted)
      aborted = true;
    else throw error;
  } finally {
    reader.releaseLock();
  }
  return { text, meta, aborted };
}

/**
 * The one entry point the UI uses: stream from the server when there is a
 * session, otherwise (or on any transport failure before the first token)
 * replay the deterministic reply through the same handlers. Callers never
 * branch on where the text came from; `meta.source` records it.
 */
export async function streamAiReply(
  accessToken: string | undefined,
  body: AiStreamRequest,
  handlers: AiStreamHandlers,
  signal?: AbortSignal
): Promise<AiStreamResult> {
  const local = () => {
    const reply = localAiReply(body.message, body.language, body.persona);
    return streamLocalReply(
      reply.body,
      { persona: body.persona, actions: reply.actions, source: "local" },
      handlers,
      signal
    );
  };
  if (!accessToken) return local();

  let received = "";
  let meta: AiStreamMeta | null = null;
  try {
    return await streamAiChat(
      accessToken,
      body,
      {
        onMeta: (m) => {
          meta = m;
          handlers.onMeta?.(m);
        },
        onDelta: (delta, text) => {
          received = text;
          handlers.onDelta(delta, text);
        }
      },
      signal
    );
  } catch {
    // A failure after text has arrived is a clean partial, not a restart.
    if (received || signal?.aborted)
      return { text: received, meta, aborted: Boolean(signal?.aborted) };
    return local();
  }
}

/** Typing cadence for a replayed local reply; fast enough to read as live, slow enough to see. */
export const LOCAL_MS_PER_CHAR = 12;

/**
 * Streams an already-known reply through the same handler interface, so the
 * panel cannot tell a scripted fallback from the model. Chunks are a few
 * characters at a time on a timer; aborting stops mid-word.
 */
export function streamLocalReply(
  text: string,
  meta: AiStreamMeta,
  handlers: AiStreamHandlers,
  signal?: AbortSignal,
  msPerChar = LOCAL_MS_PER_CHAR
): Promise<AiStreamResult> {
  handlers.onMeta?.(meta);
  return new Promise((resolve) => {
    // Group ~3 characters per tick: a 1 ms timer would be throttled anyway.
    const step = 3;
    let i = 0;
    let out = "";
    const tick = () => {
      if (signal?.aborted) return resolve({ text: out, meta, aborted: true });
      if (i >= text.length) return resolve({ text: out, meta, aborted: false });
      const delta = text.slice(i, i + step);
      i += step;
      out += delta;
      handlers.onDelta(delta, out);
      setTimeout(tick, msPerChar * step);
    };
    tick();
  });
}
