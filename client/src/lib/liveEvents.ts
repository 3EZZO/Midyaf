import { useEffect, useSyncExternalStore } from "react";
import type { ServerEventName, ServerEvents } from "./useSocket";

/**
 * Tiny typed event bus. The socket republishes every server event onto it,
 * and (from Phase 5) the demo director publishes the same event types
 * locally. Panels subscribe here and never to the socket directly, so a
 * panel cannot tell live traffic from a rehearsal.
 */

export type LiveEventName = ServerEventName;
export type LiveEventPayload<K extends LiveEventName> = ServerEvents[K];

export type LiveEvent = {
  [K in LiveEventName]: { name: K; payload: LiveEventPayload<K>; at: number; source: "socket" | "director" };
}[LiveEventName];

type Listener<K extends LiveEventName> = (payload: LiveEventPayload<K>, event: Extract<LiveEvent, { name: K }>) => void;

// Stored untyped; the public `on`/`emit` signatures keep callers type-safe.
type AnyListener = (payload: unknown, event: LiveEvent) => void;
const listeners = new Map<LiveEventName, Set<AnyListener>>();
const anyListeners = new Set<(event: LiveEvent) => void>();

const HISTORY_LIMIT = 200;
let history: LiveEvent[] = [];
let historyVersion = 0;
const historyListeners = new Set<() => void>();

export const liveEvents = {
  emit<K extends LiveEventName>(name: K, payload: LiveEventPayload<K>, source: LiveEvent["source"] = "socket") {
    const event = { name, payload, at: Date.now(), source } as Extract<LiveEvent, { name: K }>;
    history = [event, ...history].slice(0, HISTORY_LIMIT);
    historyVersion++;
    listeners.get(name)?.forEach((fn) => fn(payload, event));
    anyListeners.forEach((fn) => fn(event));
    historyListeners.forEach((fn) => fn());
  },

  on<K extends LiveEventName>(name: K, fn: Listener<K>): () => void {
    if (!listeners.has(name)) listeners.set(name, new Set());
    const set = listeners.get(name)!;
    const entry = fn as unknown as AnyListener;
    set.add(entry);
    return () => set.delete(entry);
  },

  onAny(fn: (event: LiveEvent) => void): () => void {
    anyListeners.add(fn);
    return () => anyListeners.delete(fn);
  },

  history(): readonly LiveEvent[] {
    return history;
  },

  clear() {
    history = [];
    historyVersion++;
    historyListeners.forEach((fn) => fn());
  }
};

/** Subscribe a component to one event type. */
export function useLiveEvent<K extends LiveEventName>(name: K, fn: Listener<K>) {
  useEffect(() => liveEvents.on(name, fn), [name, fn]);
}

const subscribeHistory = (fn: () => void) => {
  historyListeners.add(fn);
  return () => historyListeners.delete(fn);
};

/** Recent events, newest first. Re-renders on every emit. */
export function useLiveHistory(limit = 20): readonly LiveEvent[] {
  useSyncExternalStore(subscribeHistory, () => historyVersion);
  return history.slice(0, limit);
}

/** Count events in the last `windowMs`, bucketed per minute (oldest → newest). */
export function eventsPerMinute(windowMs = 30 * 60_000, now = Date.now()): number[] {
  const buckets = Math.ceil(windowMs / 60_000);
  const out = new Array(buckets).fill(0);
  for (const e of history) {
    const age = now - e.at;
    if (age < 0 || age >= windowMs) continue;
    out[buckets - 1 - Math.floor(age / 60_000)]++;
  }
  return out;
}
