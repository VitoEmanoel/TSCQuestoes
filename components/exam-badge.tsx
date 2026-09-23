const YEAR_STYLES: Record<number, string> = {
  2008: "bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  2011: "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  2014: "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  2017: "bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:ring-orange-800",
  2021: "bg-rose-100 text-rose-900 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800",
};

const FALLBACK_STYLE =
  "bg-zinc-100 text-zinc-900 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700";

export function ExamBadge({ year }: { year: number }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide ring-1 ring-inset ${YEAR_STYLES[year] ?? FALLBACK_STYLE}`}
    >
      ENADE {year}
    </span>
  );
}
