import { cn } from "../../lib/cn";

/**
 * Pure-SVG static Saudi Sadu geometric brass ribbon.
 * RTL-symmetric, zero animation, zero external assets — picks up Qasr Obsidian
 * brass CSS tokens (--gold-500 / --gold-300) automatically.
 */
export function SaduRibbon({
  variant = "hairline",
  className
}: {
  variant?: "hairline" | "crest";
  className?: string;
}) {
  const height = variant === "crest" ? 12 : 8;
  const patternId = variant === "crest" ? "qasr-sadu-crest" : "qasr-sadu-hairline";

  return (
    <div
      aria-hidden="true"
      data-sadu-ribbon={variant}
      className={cn("pointer-events-none w-full overflow-hidden select-none", className)}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 320 ${height}`}
        preserveAspectRatio="xMidYMid slice"
        className="block w-full"
        focusable="false"
      >
        <defs>
          {variant === "crest" ? (
            <pattern id={patternId} width="32" height="12" patternUnits="userSpaceOnUse">
              <line x1="0" y1="1" x2="32" y2="1" stroke="rgb(var(--gold-500) / 0.35)" strokeWidth="1" />
              <polygon
                points="16,2 22,6 16,10 10,6"
                fill="rgb(var(--gold-500) / 0.28)"
                stroke="rgb(var(--gold-300) / 0.7)"
                strokeWidth="0.8"
              />
              <polygon points="16,4.2 18.5,6 16,7.8 13.5,6" fill="rgb(var(--gold-300) / 0.9)" />
              <polyline
                points="0,6 6,3 8,6 6,9 0,6"
                fill="none"
                stroke="rgb(var(--gold-500) / 0.45)"
                strokeWidth="0.8"
              />
              <polyline
                points="32,6 26,3 24,6 26,9 32,6"
                fill="none"
                stroke="rgb(var(--gold-500) / 0.45)"
                strokeWidth="0.8"
              />
              <line x1="0" y1="11" x2="32" y2="11" stroke="rgb(var(--gold-500) / 0.35)" strokeWidth="1" />
            </pattern>
          ) : (
            <pattern id={patternId} width="24" height="8" patternUnits="userSpaceOnUse">
              <line x1="0" y1="4" x2="24" y2="4" stroke="rgb(var(--gold-500) / 0.2)" strokeWidth="0.75" />
              <polygon
                points="12,1 16,4 12,7 8,4"
                fill="rgb(var(--gold-500) / 0.24)"
                stroke="rgb(var(--gold-300) / 0.55)"
                strokeWidth="0.7"
              />
              <circle cx="0" cy="4" r="1" fill="rgb(var(--gold-500) / 0.5)" />
              <circle cx="24" cy="4" r="1" fill="rgb(var(--gold-500) / 0.5)" />
            </pattern>
          )}
        </defs>
        <rect width="320" height={height} fill={`url(#${patternId})`} />
      </svg>
    </div>
  );
}
