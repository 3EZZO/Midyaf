import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CAPTAIN_PHOTO_PLACEHOLDER,
  CaptainPhoto,
  captainPhotoSrc,
  failedCaptainPhoto
} from "./CaptainPhoto";

/**
 * VIS-02. There is no DOM test environment here, so the component is rendered
 * with react-dom/server (initial markup only) and the error/recovery state
 * transitions are tested through the helpers the onError handler uses. The
 * real browser onError and source-change lifecycle is not exercised here.
 */

const CLASS = "size-16 shrink-0 rounded-lg object-cover";

function render(src: string | null | undefined, alt = "Captain One") {
  return renderToStaticMarkup(<CaptainPhoto src={src} alt={alt} className={CLASS} />);
}

describe("CaptainPhoto render", () => {
  it("uses the existing branded placeholder asset", () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "client/public", CAPTAIN_PHOTO_PLACEHOLDER))
    ).toBe(true);
  });

  it("shows the placeholder for a missing or empty photo", () => {
    for (const src of [undefined, null, "", "   "]) {
      const html = render(src);
      expect(html).toContain(`src="${CAPTAIN_PHOTO_PLACEHOLDER}"`);
      expect(html).toContain('alt="Captain One"');
    }
  });

  it("shows a valid uploaded photo unchanged, keeping alt text and layout classes", () => {
    const html = render("/uploads/driver-photo.jpg", "Captain Two");
    expect(html).toContain('src="/uploads/driver-photo.jpg"');
    expect(html).toContain('alt="Captain Two"');
    expect(html).toContain(`class="${CLASS}"`);
  });
});

describe("captain photo fallback state", () => {
  it("replaces only the URL that failed", () => {
    expect(captainPhotoSrc("/uploads/a.jpg", "/uploads/a.jpg")).toBe(CAPTAIN_PHOTO_PLACEHOLDER);
    expect(captainPhotoSrc("/uploads/a.jpg", null)).toBe("/uploads/a.jpg");
  });

  it("recovers when a different photo or captain follows a failure", () => {
    expect(captainPhotoSrc("/uploads/b.jpg", "/uploads/a.jpg")).toBe("/uploads/b.jpg");
  });

  it("remembers a failed photo once and ignores a failing placeholder (no error loop)", () => {
    const failed = failedCaptainPhoto("/uploads/a.jpg", null);
    expect(failed).toBe("/uploads/a.jpg");
    const shown = captainPhotoSrc("/uploads/a.jpg", failed);
    expect(shown).toBe(CAPTAIN_PHOTO_PLACEHOLDER);
    // An error from the placeholder returns the same state, so nothing re-renders.
    expect(failedCaptainPhoto(shown, failed)).toBe(failed);
    expect(failedCaptainPhoto(CAPTAIN_PHOTO_PLACEHOLDER, null)).toBeNull();
  });
});
