import { useSyncExternalStore } from "react";

/**
 * Projector mode (Qasr Obsidian): larger root type, stronger hairlines and
 * chart strokes, and no grain, so every figure reads from 5 m in a lit room.
 * One switch shared by the keyboard shortcut (Ctrl/Cmd+Shift+P), the command
 * palette and the top bar. The styles live in styles/index.css under
 * html[data-density="projector"].
 */
const STORAGE_KEY = "midyaf.density";
const CHANGE_EVENT = "midyaf:density";

export function isProjectorMode(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.density === "projector";
}

export function setProjectorMode(on: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (on) root.dataset.density = "projector";
  else delete root.dataset.density;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "projector" : "");
  } catch {
    // Storage can be unavailable (private mode); the switch still works for this visit.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: on }));
}

export function toggleProjectorMode() {
  setProjectorMode(!isProjectorMode());
}

/** Re-applies the saved choice on boot. */
export function restoreProjectorMode() {
  try {
    if (window.localStorage.getItem(STORAGE_KEY) === "projector") {
      document.documentElement.dataset.density = "projector";
    }
  } catch {
    // ignore
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/** Current projector state, re-rendering whenever any control flips it. */
export function useProjectorMode(): boolean {
  return useSyncExternalStore(subscribe, isProjectorMode, () => false);
}
