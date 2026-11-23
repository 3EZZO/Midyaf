/**
 * Guarded single-key presenter hotkeys (demo/presenter mode only).
 *
 * Never intercepts typing inside inputs, textareas, selects, contentEditable
 * elements, open dialogs, QuickNav, or the War Room bridge (which owns its own
 * Space / Arrow / M / R narrator shortcuts).
 */

export type PresenterHotkeyAction =
  | "toggle-shortcuts"
  | "toggle-projector"
  | "toggle-language"
  | "toggle-warroom";

export type HotkeyTargetLike =
  | EventTarget
  | {
      tagName?: string;
      isContentEditable?: boolean;
      closest?: (selector: string) => unknown;
    }
  | null
  | undefined;

export interface HotkeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: HotkeyTargetLike;
}

export interface PresenterHotkeyContext {
  /** Only active when investor demo switcher or simulation mode is enabled. */
  enabled: boolean;
  isWarRoomOpen: boolean;
  isQuickNavOpen: boolean;
  /** True when the presenter shortcuts dialog itself is already open. */
  isShortcutsOpen?: boolean;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function isEditableOrDialogTarget(target: HotkeyTargetLike): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selector: string) => unknown;
  };
  const tag = el.tagName?.toUpperCase();
  if (tag && EDITABLE_TAGS.has(tag)) return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function") {
    if (
      el.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]'
      )
    ) {
      return true;
    }
  }
  return false;
}

export function resolvePresenterHotkey(
  event: HotkeyEventLike,
  context: PresenterHotkeyContext
): PresenterHotkeyAction | null {
  if (!context.enabled) return null;
  if (context.isWarRoomOpen || context.isQuickNavOpen) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isEditableOrDialogTarget(event.target)) return null;

  // `?` requires Shift on most keyboards, so allow shiftKey for `?`.
  if (event.key === "?") {
    return "toggle-shortcuts";
  }

  // While the shortcuts modal is open, ignore other plain presenter letters.
  if (context.isShortcutsOpen) return null;
  if (event.shiftKey) return null;

  switch (event.key.toLowerCase()) {
    case "p":
      return "toggle-projector";
    case "l":
      return "toggle-language";
    case "w":
      return "toggle-warroom";
    default:
      return null;
  }
}
