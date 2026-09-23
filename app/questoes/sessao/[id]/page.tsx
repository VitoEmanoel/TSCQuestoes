import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamBadge } from "@/components/exam-badge";
import { requireUser } from "@/lib/dal";
import { practiceSessionResults } from "@/lib/practice";
import { questionTitle } from "@/lib/questions";
import { latestPerQuestion } from "@/lib/scoring";

export const metadata: Metadata = { title: "Resultado da sessão — TSCQuestões" };

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function formatScore(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default async function PracticeSessionPage(props: PageProps<"/questoes/sessao/[id]">) {
  const { id } = await props.params;
  const user = await requireUser(`/questoes/sessao/${encodeURIComponent(id)}`);
  const results = await practiceSessionResults(user.id, id);
  if (!results) {
    notFound();
  }
  const { summary } = results;
  const anuladas = summary.objectives.anuladas + summary.discursives.anuladas;
  const items = latestPerQuestion(results.items).sort(
    (first, second) => first.answeredAt.getTime() - second.answeredAt.getTime(),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/questoes" className="text-sm underline">
        ← Voltar para a lista
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Resultado da sessão</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Finalizada em {formatWhen(results.submittedAt ?? results.startedAt)}.
        </p>
      </header>

      <section
        aria-label="Resumo"
        className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        {summary.objectives.counted > 0 ? (
          <p className="text-lg font-semibold">
            {summary.objectives.correct} de {summary.objectives.counted}{" "}
            {summary.objectives.counted === 1 ? "objetiva certa" : "objetivas certas"}
            {summary.percent !== null ? ` (${formatScore(summary.percent)}%)` : null}
          </p>
        ) : null}
        {summary.discursives.evaluated > 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Discursivas autoavaliadas: {formatScore(summary.discursives.points)} de{" "}
            {formatScore(summary.discursives.max)} pontos.
          </p>
        ) : null}
        {summary.discursives.unevaluated > 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {summary.discursives.unevaluated}{" "}
            {summary.discursives.unevaluated === 1
              ? "discursiva ainda sem autoavaliação"
              : "discursivas ainda sem autoavaliação"}
            : abra para comparar com o padrão oficial e se avaliar.
          </p>
        ) : null}
        {anuladas > 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {anuladas}{" "}
            {anuladas === 1
              ? "questão anulada pelo INEP ficou fora da nota"
              : "questões anuladas pelo INEP ficaram fora da nota"}
            .
          </p>
        ) : null}
      </section>

      <ol className="flex flex-col gap-3">
        {items.map((item) => {
          const isAnulada = item.question.status === "ANULADA";
          const correctLetter = item.question.options[0]?.letter ?? null;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <ExamBadge year={item.question.exam.year} />
                <Link
                  href={`/questoes/${item.question.id}`}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {questionTitle(item.question.originalLabel, item.question.type)}
                </Link>
              </div>
              {item.selectedLetter !== null ? (
                isAnulada ? (
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Você marcou a {item.selectedLetter}. Questão anulada: não conta.
                  </p>
                ) : item.selectedLetter === correctLetter ? (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Acertou: alternativa {item.selectedLetter}.
                  </p>
                ) : (
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">
                    Errou: você marcou a {item.selectedLetter}; a correta é a {correctLetter}.
                  </p>
                )
              ) : isAnulada ? (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Resposta discursiva enviada. Questão anulada: não conta.
                </p>
              ) : (
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Resposta discursiva enviada.{" "}
                  {item.selfScore !== null
                    ? `Autoavaliação: ${formatScore(item.selfScore)}.`
                    : "Ainda sem autoavaliação."}{" "}
                  <Link href={`/questoes/${item.question.id}`} className="underline">
                    Ver padrão e se autoavaliar
                  </Link>
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
