export function ExamBadge({ year }: { year: number }) {
  return (
    <span className="inline-flex items-center rounded-md border border-zinc-300 px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      ENADE {year}
    </span>
  );
}
