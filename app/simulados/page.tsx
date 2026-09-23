import type { Metadata } from "next";
import { startReplayAction } from "@/app/actions/simulados";
import Link from "next/link";
import { CustomSimuladoForm } from "@/components/custom-simulado-form";
import { ExamBadge } from "@/components/exam-badge";
import { formatMinutes } from "@/components/simulado-badge";
import { requireUser } from "@/lib/dal";
import { AREA_LABEL, getFilterOptions, TYPE_LABEL } from "@/lib/questions";
import {
  closeExpiredSimulados,
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
  const [exams, custom, { years, topics }] = await Promise.all([
    listReplayExams(user.id),
    openCustomSimulados(user.id),
    getFilterOptions(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Simulados</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Refaça uma prova do ENADE inteira, na ordem original. A correção e o padrão de resposta só
          aparecem depois que você entregar.
        </p>
      </header>
      <section aria-label="Provas completas" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Prova completa</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {exams.map((exam) => (
            <li
              key={exam.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center gap-2">
                <ExamBadge year={exam.year} />
                <span className="font-semibold">Prova de {exam.year}</span>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {exam.total} questões: {exam.objectives} objetivas e {exam.discursives} discursivas.
                {exam.anuladas > 0
                  ? ` ${exam.anuladas} ${exam.anuladas === 1 ? "foi anulada" : "foram anuladas"} pelo INEP e não ${exam.anuladas === 1 ? "conta" : "contam"} na nota.`
                  : null}
              </p>
              {exam.openAttempt ? (
                <p className="text-sm text-sky-800 dark:text-sky-300">
                  Em andamento: {exam.openAttempt.answered} de {exam.total} respondidas.
                </p>
              ) : null}
              <form action={startReplayAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="examId" value={exam.id} />
                {exam.openAttempt ? null : (
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Tempo</span>
                    <select
                      name="tempo"
                      defaultValue=""
                      className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {exam.openAttempt ? "Continuar simulado" : "Começar simulado"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Simulado personalizado" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Simulado personalizado</h2>
        {custom.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {custom.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950"
              >
                <span>
                  Em andamento desde {formatWhen(attempt.startedAt)}: {attempt.answered} de{" "}
                  {attempt.total} respondidas
                  {attempt.timeLimitSec ? ` · ${formatMinutes(attempt.timeLimitSec)}` : null}
                </span>
                <Link href={`/simulados/${attempt.id}`} className="font-medium underline">
                  Continuar
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <CustomSimuladoForm
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
