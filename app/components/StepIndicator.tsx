import Link from "next/link";
import { cx } from "./ui.tsx";

type Step = { label: string; href: string; locked: string | null };

const PILL = "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm";

/**
 * Choose -> Review & confirm -> Matrix & gaps -> Report. Available steps are real links that look like
 * outlined buttons; the current step is filled and marked aria-current; locked steps are disabled with the reason.
 */
export function StepIndicator({ current, confirmedCount }: { current: 1 | 2 | 3 | 4; confirmedCount: number }) {
  const needsOne = confirmedCount > 0 ? null : "Confirm 1 control first";
  const steps: Step[] = [
    { label: "Choose controls", href: "/", locked: null },
    { label: "Review & confirm", href: "/review", locked: null },
    { label: "Matrix & gaps", href: "/matrix", locked: needsOne },
    { label: "Report", href: "/report", locked: needsOne },
  ];
  return (
    <nav aria-label="Steps">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {steps.map((s, i) => {
          const n = i + 1;
          const number = (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-xs font-semibold text-current ring-1 ring-current/30">
              {n}
            </span>
          );
          let body: React.ReactNode;
          if (n === current) {
            body = (
              <span aria-current="step" className={cx(PILL, "bg-blue-600 font-semibold text-white")}>
                {number}
                {s.label}
              </span>
            );
          } else if (s.locked) {
            body = (
              <span
                aria-disabled="true"
                title={s.locked}
                className={cx(PILL, "cursor-not-allowed border border-dashed border-slate-300 text-slate-400")}
              >
                {number}
                {s.label}
                <span className="text-xs">({s.locked.toLowerCase()})</span>
              </span>
            );
          } else {
            body = (
              <Link
                href={s.href}
                className={cx(
                  PILL,
                  "bg-white text-blue-700 ring-1 ring-inset ring-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                )}
              >
                {number}
                {s.label}
              </Link>
            );
          }
          return (
            <li key={s.label} className="flex items-center gap-1.5">
              {body}
              {n < steps.length && (
                <span aria-hidden className="text-slate-400">
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
