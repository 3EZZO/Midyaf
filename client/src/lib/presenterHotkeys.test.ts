import { describe, expect, it } from "vitest";
import { isEditableOrDialogTarget, resolvePresenterHotkey } from "./presenterHotkeys";

const enabledCtx = {
  enabled: true,
  isWarRoomOpen: false,
  isQuickNavOpen: false,
  isShortcutsOpen: false
};

describe("presenterHotkeys guard", () => {
  it("maps plain ?, p, l, w when presenter mode is enabled outside forms and overlays", () => {
    expect(resolvePresenterHotkey({ key: "?", shiftKey: true }, enabledCtx)).toBe("toggle-shortcuts");
    expect(resolvePresenterHotkey({ key: "p" }, enabledCtx)).toBe("toggle-projector");
    expect(resolvePresenterHotkey({ key: "l" }, enabledCtx)).toBe("toggle-language");
    expect(resolvePresenterHotkey({ key: "w" }, enabledCtx)).toBe("toggle-warroom");
  });

  it("ignores all hotkeys when presenter/demo mode is disabled", () => {
    const disabled = { ...enabledCtx, enabled: false };
    expect(resolvePresenterHotkey({ key: "?" }, disabled)).toBeNull();
    expect(resolvePresenterHotkey({ key: "p" }, disabled)).toBeNull();
    expect(resolvePresenterHotkey({ key: "l" }, disabled)).toBeNull();
    expect(resolvePresenterHotkey({ key: "w" }, disabled)).toBeNull();
  });

  it("ignores hotkeys inside inputs, textareas, selects, contentEditable, or open dialogs", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "TEXTAREA" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
      { tagName: "BUTTON", closest: (s: string) => (s.includes("dialog") ? {} : null) }
    ]) {
      expect(isEditableOrDialogTarget(target)).toBe(true);
      expect(resolvePresenterHotkey({ key: "p", target }, enabledCtx)).toBeNull();
      expect(resolvePresenterHotkey({ key: "w", target }, enabledCtx)).toBeNull();
      expect(resolvePresenterHotkey({ key: "?", shiftKey: true, target }, enabledCtx)).toBeNull();
    }
  });

  it("ignores hotkeys when modifiers are held, War Room is open, or QuickNav is open", () => {
    expect(resolvePresenterHotkey({ key: "p", ctrlKey: true }, enabledCtx)).toBeNull();
    expect(resolvePresenterHotkey({ key: "l", metaKey: true }, enabledCtx)).toBeNull();
    expect(resolvePresenterHotkey({ key: "w", altKey: true }, enabledCtx)).toBeNull();
    expect(resolvePresenterHotkey({ key: "p", shiftKey: true }, enabledCtx)).toBeNull();
    expect(resolvePresenterHotkey({ key: "w" }, { ...enabledCtx, isWarRoomOpen: true })).toBeNull();
    expect(resolvePresenterHotkey({ key: "?" }, { ...enabledCtx, isWarRoomOpen: true })).toBeNull();
    expect(resolvePresenterHotkey({ key: "l" }, { ...enabledCtx, isQuickNavOpen: true })).toBeNull();
  });

  it("allows ? to toggle closed when shortcuts modal is open while blocking plain letters", () => {
    const modalOpen = { ...enabledCtx, isShortcutsOpen: true };
    expect(resolvePresenterHotkey({ key: "?", shiftKey: true }, modalOpen)).toBe("toggle-shortcuts");
    expect(resolvePresenterHotkey({ key: "p" }, modalOpen)).toBeNull();
    expect(resolvePresenterHotkey({ key: "w" }, modalOpen)).toBeNull();
  });
});
