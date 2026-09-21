import { QRCodeSVG } from "qrcode.react";
import { cn } from "../../lib/cn";

/**
 * A scannable QR on a light tile. Scanners want dark modules on a light
 * ground, so the tile is deliberately the one light surface in the app;
 * the gold hairline ties it back to the brand.
 */
export function QrCode({
  value,
  size = 128,
  label,
  className
}: {
  value: string;
  size?: number;
  /** Accessible name; the code itself is decorative to screen readers. */
  label?: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "inline-flex flex-col items-center gap-1.5 rounded-lg border border-gold-500/40 bg-white p-2",
        className
      )}
      style={{ direction: "ltr" }}
    >
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={0}
        bgColor="#FFFFFF"
        fgColor="#090C15"
        title={label}
        role="img"
        aria-label={label}
      />
      {label ? (
        <figcaption className="max-w-full truncate text-xs font-semibold text-surface-0">
          {label}
        </figcaption>
      ) : null}
    </figure>
  );
}
