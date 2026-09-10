import type { ReactNode } from "react";
import { Badge } from "./Badge";

export function PortalHero({
  badge,
  title,
  body
}: {
  badge: ReactNode;
  title: ReactNode;
  body: ReactNode;
}) {
  return (
    <section className="hero-gradient rounded-xl p-6 text-white shadow-luxury-lg overflow-hidden animate-fadeInUp">
      <Badge tone="gold">{badge}</Badge>
      <h1 className="mt-4 text-2xl font-black tracking-tight animate-fadeInUp delay-200">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/70 animate-fadeInUp delay-300">{body}</p>
    </section>
  );
}
