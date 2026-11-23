import type { Request } from "express";

/**
 * The address chain Express walks for `trust proxy` (proxy-addr semantics):
 * index 0 is the socket peer, then X-Forwarded-For entries from right to left.
 */
export function forwardedChain(req: Pick<Request, "socket" | "headers">): string[] {
  const socketAddress = req.socket?.remoteAddress ?? "unknown";
  const header = req.headers["x-forwarded-for"];
  const raw = Array.isArray(header) ? header.join(",") : header ?? "";
  const forwarded = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse();
  return [socketAddress, ...forwarded];
}

/** What `req.ip` would be with `trust proxy` set to `hops` (a hop count). */
export function clientIpForHops(chain: string[], hops: number): string {
  return chain[Math.min(Math.max(0, hops), chain.length - 1)];
}
