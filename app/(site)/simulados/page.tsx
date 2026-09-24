import type { Metadata } from "next";
import { startReplayAction } from "@/app/actions/simulados";
import Link from "next/link";
import { CustomSimuladoForm } from "@/components/custom-simulado-form";
import { formatMinutes } from "@/components/simulado-badge";
import { requireUser } from "@/lib/dal";
import { AREA_LABEL, getFilterOptions, TYPE_LABEL } from "@/lib/questions";
import {
  closeExpiredSimulados,
  customCatalog,
  listReplayExams,
  MAX_CUSTOM_QUESTIONS,
  openCustomSimulados,
  TIME_LIMIT_MINUTES,
} from "@/lib/simulados";

const COUNTS = [5, 10, 15, 20, 30, MAX_CUSTOM_QUESTIONS];

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export const metadata: Metadata = { title: "Simulados — TSCQuestões" };

export default async function SimuladosPage() {
  const user = await requireUser("/simulados");
  await closeExpiredSimulados(user.id);
  const [exams, custom, { years, topics }, catalog] = await Promise.all([
    listReplayExams(user.id),
    openCustomSimulados(user.id),
    getFilterOptions(),
    customCatalog(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Simulados</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Refaça uma prova do ENADE inteira, na ordem original. A correção e o padrão de resposta só
          aparecem depois que você entregar.
        </p>
      </header>
      <section aria-label="Provas completas" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Prova completa</h2>
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {exams.map((exam) => (
            <li
              key={exam.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  Prova de {exam.year}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {exam.openAttempt
                    ? `Em andamento: ${exam.openAttempt.answered} de ${exam.total} respondidas`
                    : `${exam.total} questões · ${exam.objectives} objetivas e ${exam.discursives} discursivas${
                        exam.anuladas > 0
                          ? ` · ${exam.anuladas} ${exam.anuladas === 1 ? "anulada" : "anuladas"}, fora da nota`
                          : ""
                      }`}
                </span>
              </div>
              <form action={startReplayAction} className="flex items-center gap-2">
                <input type="hidden" name="examId" value={exam.id} />
                {exam.openAttempt ? null : (
                  <label className="flex items-center">
                    <span className="sr-only">Tempo da prova de {exam.year}</span>
                    <select
                      name="tempo"
                      defaultValue=""
                      className="min-h-11 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Sem tempo</option>
                      {TIME_LIMIT_MINUTES.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {formatMinutes(minutes * 60)}
                          {minutes === 240 ? " (como no ENADE)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="submit"
                  className={
                    exam.openAttempt
                      ? "bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors"
                      : "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  }
                >
                  {exam.openAttempt ? "Continuar" : "Começar"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Simulado personalizado" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Simulado personalizado
        </h2>
        {custom.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {custom.map((attempt) => (
              <li
                key={attempt.id}
                className="bg-accent-soft flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
              >
                <span>
                  Em andamento desde {formatWhen(attempt.startedAt)}: {attempt.answered} de{" "}
                  {attempt.total} respondidas
                  {attempt.timeLimitSec ? ` · ${formatMinutes(attempt.timeLimitSec)}` : null}
                </span>
                <Link href={`/simulados/${attempt.id}`} className="tap text-accent font-medium">
                  Continuar
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <CustomSimuladoForm
          catalog={catalog}
          years={years}
          topics={topics}
          areas={Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }))}
          types={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          counts={COUNTS}
          minutes={TIME_LIMIT_MINUTES}
        />
      </section>
    </main>
  );
}
