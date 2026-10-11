import Link from "next/link";
import type { ReactNode } from "react";
import type { MappingMode } from "@/lib/mapping/types.ts";
import { RATINGS, RATING_HELP, RATING_LABELS } from "@/lib/scoring/config.ts";
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
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[13px] font-semibold ring-1 ring-inset", style)}>{role}</span>;
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

/** What the four ratings mean, as a short list at body size. Scores are shown with the radio buttons. */
export function RatingKey() {
  return (
    <div className="text-sm text-slate-700" aria-label="What the ratings mean">
      <p className="font-medium text-slate-900">Ratings</p>
      <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {RATINGS.map((r) => (
          <li key={r}>
            <span className="font-semibold text-slate-900">{RATING_LABELS[r]}</span>: {RATING_HELP[r]}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ItemStatusBadge({ badge }: { badge: ItemBadge }) {
  const style = {
    "AI-suggested": "bg-violet-50 text-violet-800 ring-violet-300",
    "Human-edited": "bg-amber-50 text-amber-900 ring-amber-300",
    Confirmed: "bg-emerald-600 text-white ring-emerald-600",
    "Not mapped": "bg-slate-50 text-slate-600 ring-slate-300",
  }[badge];
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-[13px] font-medium ring-1 ring-inset", style)}>{badge}</span>;
}

export function ControlStatusBadge({ status }: { status: ControlStatus }) {
  const [label, style] = {
    draft: ["Not mapped yet", "bg-slate-100 text-slate-700"],
    "awaiting-review": ["Awaiting review", "bg-amber-100 text-amber-900"],
    confirmed: ["Confirmed", "bg-emerald-600 text-white"],
  }[status];
  return <span className={cx("inline-flex shrink-0 rounded-full px-2 py-0.5 text-[13px] font-medium", style)}>{label}</span>;
}

export function ModeBadge({ mode }: { mode: MappingMode }) {
  const [label, style] = {
    live: ["Live AI", "bg-violet-600 text-white"],
    demo: ["Demo mode: saved AI output", "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-300"],
    mock: ["Mock mapper: not AI", "bg-slate-200 text-slate-800"],
  }[mode];
  return <span className={cx("inline-flex rounded px-2 py-0.5 text-[13px] font-semibold", style)}>{label}</span>;
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

// Button colours across the app: primary actions green, secondary actions blue outline, AI actions violet
// (matching the AI badge), destructive actions red outline, disabled grey. Never black.
type Variant = "primary" | "secondary" | "danger" | "ai" | "confirm";
type Size = "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700",
  confirm: "bg-emerald-600 text-white hover:bg-emerald-700",
  secondary: "bg-white text-blue-700 ring-1 ring-inset ring-blue-600 hover:bg-blue-50",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50",
  ai: "bg-violet-600 text-white hover:bg-violet-700",
};
const SIZE: Record<Size, string> = { md: "px-3 py-1.5 text-sm", lg: "px-5 py-2.5 text-base" };
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
const DISABLED = "disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:ring-0 disabled:hover:bg-slate-200";

export const buttonClass = (variant: Variant = "secondary", size: Size = "md") => cx(BASE, SIZE[size], VARIANT[variant], DISABLED);

export function Button({
  children,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button type="button" className={cx(buttonClass(variant, size), className)} {...props}>
      {children}
    </button>
  );
}

/** A link that looks like a button (for moving between steps). */
export function LinkButton({
  href,
  children,
  variant = "secondary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size), className)}>
      {children}
    </Link>
  );
}

/** The same look as a disabled button, with the reason shown next to it. */
export function DisabledAction({ children, reason, size = "md" }: { children: ReactNode; reason: string; size?: Size }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-slate-600">{reason}</span>
      <button type="button" disabled title={reason} className={buttonClass("primary", size)}>
        {children}
      </button>
    </span>
  );
}

/**
 * End-of-page navigation, the same on every step page: a blue Back link on the left and the
 * primary next action (large green) on the right.
 */
export function StepFooter({ back, children }: { back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      {back ? (
        <TextLink href={back.href} className="text-sm">
          ← {back.label}
        </TextLink>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** Blue underlined text link. */
export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900 hover:decoration-blue-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export { cx };
