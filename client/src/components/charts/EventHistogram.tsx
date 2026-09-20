import { useEffect, useState } from "react";
import { eventsPerMinute, useLiveHistory } from "../../lib/liveEvents";
import { cn } from "../../lib/cn";

/**
 * Live events per minute over the last `minutes`, straight from the event
 * bus. Re-renders on every emit and once a minute so buckets slide.
 */
export function EventHistogram({
  minutes = 30,
  height = 56,
  className,
  isArabic
}: {
  minutes?: number;
  height?: number;
  className?: string;
  isArabic: boolean;
}) {
  useLiveHistory(1);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const buckets = eventsPerMinute(minutes * 60_000);
  const max = Math.max(1, ...buckets);
  const total = buckets.reduce((a, b) => a + b, 0);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-end gap-px" style={{ height, direction: "ltr" }} role="img" aria-label={`${total} events`}>
        {buckets.map((v, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-sm transition-[height] duration-slow", v ? "bg-gold-500" : "bg-surface-3")}
            style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v ? 0.45 + (v / max) * 0.55 : 1 }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-faint">
        <span>{isArabic ? `آخر ${minutes} دقيقة` : `Last ${minutes} min`}</span>
        <span className="font-tnum">{total} {isArabic ? "حدث" : "events"}</span>
      </div>
    </div>
  );
}
