import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProjectorMode, restoreProjectorMode, setProjectorMode, toggleProjectorMode } from "./projectorMode";

// The suite runs in node: stand in for the few DOM pieces the switch uses.
const realDocument = (globalThis as { document?: unknown }).document;
const realWindow = (globalThis as { window?: unknown }).window;

let store: Map<string, string>;
let events: boolean[];

beforeEach(() => {
  store = new Map();
  events = [];
  const target = new EventTarget();
  target.addEventListener("midyaf:density", (event) => events.push((event as CustomEvent<boolean>).detail));
  (globalThis as { document?: unknown }).document = { documentElement: { dataset: {} as Record<string, string> } };
  (globalThis as { window?: unknown }).window = Object.assign(target, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value)
    }
  });
});

afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  (globalThis as { window?: unknown }).window = realWindow;
});

describe("projector mode", () => {
  it("toggles the density attribute, remembers it and announces each change", () => {
    expect(isProjectorMode()).toBe(false);
    toggleProjectorMode();
    expect(isProjectorMode()).toBe(true);
    expect(store.get("midyaf.density")).toBe("projector");
    toggleProjectorMode();
    expect(isProjectorMode()).toBe(false);
    expect(store.get("midyaf.density")).toBe("");
    expect(events).toEqual([true, false]);
  });

  it("restores the saved choice on boot without announcing it", () => {
    store.set("midyaf.density", "projector");
    restoreProjectorMode();
    expect(isProjectorMode()).toBe(true);
    expect(events).toEqual([]);
  });

  it("setProjectorMode(false) clears the attribute", () => {
    setProjectorMode(true);
    setProjectorMode(false);
    expect(isProjectorMode()).toBe(false);
  });
});
