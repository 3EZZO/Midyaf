import React, { memo } from "react";
import { use3DTilt } from "../lib/use3DTilt";

interface RoyalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  elevated?: boolean;
  interactive?: boolean;
  tone?: "purple" | "gold" | "emerald" | "default";
}

export const RoyalCard = memo<RoyalCardProps>(({
  children,
  elevated = false,
  interactive = true,
  tone = "default",
  className = "",
  ...props
}) => {
  const { ref, handleMouseMove, handleMouseLeave } = use3DTilt<HTMLDivElement>({
    maxRotation: 6,
    scale: interactive ? 1.015 : 1
  });

  const toneGlows = {
    default: "from-midyaf-gold/20 via-midyaf-purple/10 to-transparent",
    purple: "from-midyaf-purple/30 via-midyaf-purple-light/15 to-transparent",
    gold: "from-midyaf-gold/35 via-amber-500/15 to-transparent",
    emerald: "from-emerald-500/25 via-teal-500/15 to-transparent"
  };

  return (
    <div
      ref={interactive ? ref : null}
      onMouseMove={interactive ? handleMouseMove : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
      role={interactive ? "article" : "region"}
      tabIndex={interactive ? 0 : undefined}
      style={{
        willChange: interactive ? "transform" : "auto",
        transition:
          "transform 250ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 300ms ease, border-color 300ms ease"
      }}
      className={`
        glass-royal group relative overflow-hidden rounded-2xl p-6
        ${elevated ? "shadow-luxury-lg ring-1 ring-midyaf-gold/40" : "shadow-card hover:shadow-card-hover"}
        ${interactive ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-midyaf-gold" : ""}
        ${className}
      `}
      {...props}
    >
      {/* Dynamic Specular Corner Glow */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-gradient-to-br ${toneGlows[tone]} blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
      />

      <div className="relative z-10">{children}</div>
    </div>
  );
});
