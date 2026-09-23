import { ExamBadge } from "@/components/exam-badge";

export function SimuladoBadge({ year }: { year: number | null }) {
  if (year !== null) {
    return <ExamBadge year={year} />;
  }
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
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
