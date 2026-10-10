import Link from "next/link";
import { cx } from "./ui.tsx";

type Step = { label: string; href: string | null; note?: string };

/** Choose -> Review & confirm -> Matrix -> Report. Matrix and Report need at least one confirmed control. */
export function StepIndicator({ current, confirmedCount }: { current: 1 | 2 | 3 | 4; confirmedCount: number }) {
  const locked = confirmedCount === 0 ? "needs 1 confirmed control" : "coming next";
  const steps: Step[] = [
    { label: "Choose controls", href: "/" },
    { label: "Review & confirm", href: "/review" },
    // Steps 5 and 6 of the build add these screens; until then they are shown but not linked.
    { label: "Matrix & gaps", href: null, note: locked },
    { label: "Report", href: null, note: locked },
  ];
  return (
    <nav aria-label="Progress">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {steps.map((s, i) => {
          const n = i + 1;
          const state = n === current ? "current" : s.href ? "available" : "locked";
          const dot = (
            <span
              className={cx(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                state === "current" && "bg-slate-900 text-white",
                state === "available" && "bg-slate-200 text-slate-800",
                state === "locked" && "bg-slate-100 text-slate-400",
              )}
            >
              {n}
            </span>
          );
          const body = (
            <span className={cx("flex items-center gap-1.5", state === "locked" && "text-slate-400")}>
              {dot}
              <span className={state === "current" ? "font-semibold text-slate-900" : undefined}>{s.label}</span>
              {state === "locked" && s.note && <span className="text-xs">({s.note})</span>}
            </span>
          );
          return (
            <li key={s.label} className="flex items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
              {state === "available" && s.href ? <Link href={s.href} className="hover:underline">{body}</Link> : body}
              {n < steps.length && <span aria-hidden className="text-slate-300">→</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
