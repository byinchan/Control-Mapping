import type { ReactNode } from "react";
import type { MappingMode } from "@/lib/mapping/types.ts";
import { RATINGS, RATING_EFFECT, RATING_HELP, RATING_LABELS } from "@/lib/scoring/config.ts";
import type { ControlStatus, ItemBadge } from "@/lib/workflow/workspace.ts";

export { FRAMEWORK_NAMES } from "@/lib/catalog/names.ts";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Who did this: AI suggests, Code calculates, Analyst decides. */
export function RoleBadge({ role }: { role: "AI" | "Code" | "Analyst" }) {
  const style = {
    AI: "bg-violet-100 text-violet-800 ring-violet-200",
    Code: "bg-sky-100 text-sky-800 ring-sky-200",
    Analyst: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  }[role];
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", style)}>{role}</span>;
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Who decides what">
      <span className="flex items-center gap-1.5"><RoleBadge role="AI" /> suggests</span>
      <span className="flex items-center gap-1.5"><RoleBadge role="Code" /> calculates</span>
      <span className="flex items-center gap-1.5"><RoleBadge role="Analyst" /> decides</span>
    </div>
  );
}

/** Short key for the four rating labels, shown with the legend. */
export function RatingKey() {
  return (
    <p className="text-xs text-slate-600" aria-label="What the ratings mean">
      <span className="font-medium text-slate-700">Ratings:</span>{" "}
      {RATINGS.map((r, i) => (
        <span key={r}>
          <span className="font-medium text-slate-800">{RATING_LABELS[r]}</span>: {RATING_HELP[r]} ({RATING_EFFECT[r].replace(`${RATING_LABELS[r]} `, "").replace(/^is /, "").replace(/\.$/, "")})
          {i < RATINGS.length - 1 ? " · " : ""}
        </span>
      ))}
    </p>
  );
}

export function ItemStatusBadge({ badge }: { badge: ItemBadge }) {
  const style = {
    "AI-suggested": "bg-violet-50 text-violet-800 ring-violet-300",
    "Human-edited": "bg-amber-50 text-amber-900 ring-amber-300",
    Confirmed: "bg-emerald-600 text-white ring-emerald-600",
    "Not mapped": "bg-slate-50 text-slate-600 ring-slate-300",
  }[badge];
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", style)}>{badge}</span>;
}

export function ControlStatusBadge({ status }: { status: ControlStatus }) {
  const [label, style] = {
    draft: ["Not mapped yet", "bg-slate-100 text-slate-700"],
    "awaiting-review": ["Awaiting review", "bg-amber-100 text-amber-900"],
    confirmed: ["Confirmed", "bg-emerald-600 text-white"],
  }[status];
  return <span className={cx("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", style)}>{label}</span>;
}

export function ModeBadge({ mode }: { mode: MappingMode }) {
  const [label, style] = {
    live: ["Live AI", "bg-violet-600 text-white"],
    demo: ["Demo mode: saved AI output", "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-300"],
    mock: ["Mock mapper: not AI", "bg-slate-200 text-slate-800"],
  }[mode];
  return <span className={cx("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold", style)}>{label}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: string; children: ReactNode }) {
  const style = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-300 bg-amber-50 text-amber-950",
    error: "border-red-300 bg-red-50 text-red-900",
    ok: "border-emerald-300 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-md border px-3 py-2 text-sm", style)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : undefined}>{children}</div>
    </div>
  );
}

export function Button({
  children,
  variant = "secondary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ai" | "confirm" }) {
  const style = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
    danger: "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50",
    ai: "bg-violet-600 text-white hover:bg-violet-500",
    confirm: "bg-emerald-600 text-white hover:bg-emerald-500",
  }[variant];
  return (
    <button
      type="button"
      className={cx("rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50", style, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export { cx };
