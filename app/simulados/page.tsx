import type { Metadata } from "next";
import { startReplayAction } from "@/app/actions/simulados";
import { ExamBadge } from "@/components/exam-badge";
import { requireUser } from "@/lib/dal";
import { listReplayExams } from "@/lib/simulados";

export const metadata: Metadata = { title: "Simulados — TSCQuestões" };

export default async function SimuladosPage() {
  const user = await requireUser("/simulados");
  const exams = await listReplayExams(user.id);

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
              <form action={startReplayAction}>
                <input type="hidden" name="examId" value={exam.id} />
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
    </main>
  );
}
