import { describe, expect, it } from "vitest";
import { clientIpForHops, forwardedChain } from "./clientIp.js";

const req = (remoteAddress: string, xff?: string | string[]) =>
  ({ socket: { remoteAddress }, headers: xff === undefined ? {} : { "x-forwarded-for": xff } }) as never;

describe("forwardedChain / clientIpForHops (trust proxy hop counting)", () => {
  it("walks socket then X-Forwarded-For right-to-left like proxy-addr", () => {
    const chain = forwardedChain(req("10.0.0.9", "6.6.6.6, 203.0.113.7, 172.70.1.2"));
    expect(chain).toEqual(["10.0.0.9", "172.70.1.2", "203.0.113.7", "6.6.6.6"]);
    expect(clientIpForHops(chain, 0)).toBe("10.0.0.9");
    expect(clientIpForHops(chain, 1)).toBe("172.70.1.2");
    // With the right hop count the client-supplied spoof (6.6.6.6) is never chosen.
    expect(clientIpForHops(chain, 2)).toBe("203.0.113.7");
  });

  it("clamps to the furthest address when hops exceed the chain", () => {
    const chain = forwardedChain(req("10.0.0.9"));
    expect(chain).toEqual(["10.0.0.9"]);
    expect(clientIpForHops(chain, 3)).toBe("10.0.0.9");
  });

  it("joins repeated X-Forwarded-For headers", () => {
    expect(forwardedChain(req("10.0.0.9", ["1.1.1.1", "2.2.2.2"]))).toEqual(["10.0.0.9", "2.2.2.2", "1.1.1.1"]);
  });
});
