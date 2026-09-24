import { ExamBadge } from "@/components/exam-badge";

export function SimuladoBadge({ year }: { year: number | null }) {
  if (year !== null) {
    return <ExamBadge year={year} />;
  }
  return (
    <span className="inline-flex items-center rounded-md border border-zinc-300 px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      Personalizado
    </span>
  );
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
