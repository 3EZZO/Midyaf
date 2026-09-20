import type { ReactNode } from "react";

export function Section({
  title,
  action,
  children,
  id,
  className
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`bg-[#121626] border border-white/5 shadow-sm rounded-lg p-5 animate-fadeInUp ${className ?? ""}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
          <span className="inline-block size-2 rounded-full bg-midyaf-gold/60 me-2"></span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
