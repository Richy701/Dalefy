import type { ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";

/** A report section: the same card, heading and helper line every Reports tab uses */
export function ReportCard({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-card rounded-xl border border-border shadow-sm p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground leading-none">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A report figure: label, big value, helper line, and an icon tile when given (every tab uses this one) */
export function Figure({ icon: FigureIcon, label, value, sub, tone = "text-muted-foreground" }: { icon?: Icon; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-4 flex items-start gap-3.5">
      {FigureIcon && (
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <FigureIcon className={`h-[18px] w-[18px] ${tone}`} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight leading-none mt-1.5 tabular-nums text-foreground truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/** A labelled share of a whole, e.g. 12 of 18 in the app */
export function Share({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground tabular-nums">{value} of {total}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden" role="img" aria-label={`${label}: ${value} of ${total}`}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

