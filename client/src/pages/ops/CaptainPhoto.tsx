import { useState } from "react";

/** Branded stand-in when a captain has no uploaded photo or it fails to load. */
export const CAPTAIN_PHOTO_PLACEHOLDER = "/midyaf-logo.jpeg";

/** The image to show: the photo URL unless it is empty or already failed. */
export function captainPhotoSrc(
  url: string | null | undefined,
  failedUrl: string | null
): string {
  const trimmed = url?.trim();
  if (!trimmed || trimmed === failedUrl) return CAPTAIN_PHOTO_PLACEHOLDER;
  return trimmed;
}

/**
 * The failed URL to remember after a load error. A failing placeholder keeps
 * the current value, so React bails out and the error cannot loop.
 */
export function failedCaptainPhoto(
  shownSrc: string,
  currentFailed: string | null
): string | null {
  return shownSrc === CAPTAIN_PHOTO_PLACEHOLDER ? currentFailed : shownSrc;
}

/**
 * Captain photo with a single fallback to the placeholder. Only the URL that
 * failed is remembered, so a different photo (or a different captain) loads
 * normally afterwards.
 */
export function CaptainPhoto({
  src,
  alt,
  className
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shownSrc = captainPhotoSrc(src, failedSrc);
  return (
    <img
      src={shownSrc}
      alt={alt}
      className={className}
      onError={() => setFailedSrc((current) => failedCaptainPhoto(shownSrc, current))}
    />
  );
}
