import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SimuladoBadge } from "@/components/simulado-badge";
import { requireUser } from "@/lib/dal";
import { closedByTime, simuladoResult } from "@/lib/simulados";
import { formatMinutes } from "@/components/simulado-badge";

export const metadata: Metadata = { title: "Resultado do simulado — TSCQuestões" };

function formatScore(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default async function SimuladoResultPage(props: PageProps<"/simulados/[id]/resultado">) {
  const { id } = await props.params;
  const user = await requireUser(`/simulados/${encodeURIComponent(id)}/resultado`);
  const result = await simuladoResult(user.id, id);
  if (!result) {
    notFound();
  }
  const { summary } = result;
  const anuladas = summary.objectives.anuladas + summary.discursives.anuladas;
  const blank = result.totalQuestions - result.items.length;
  const usedSeconds = result.submittedAt
    ? Math.round((result.submittedAt.getTime() - result.startedAt.getTime()) / 1000)
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/simulados" className="text-sm underline">
        ← Voltar para os simulados
      </Link>
      <header className="flex items-center gap-2">
        <SimuladoBadge year={result.year} />
        <h1 className="text-2xl font-semibold tracking-tight">Simulado entregue</h1>
      </header>
      <section
        aria-label="Nota"
        className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <p className="text-lg font-semibold">
          {summary.objectives.correct} de {summary.objectives.counted}{" "}
          {summary.objectives.counted === 1 ? "objetiva certa" : "objetivas certas"}
          {summary.percent !== null ? ` (${formatScore(summary.percent)}%)` : null}
        </p>
        {closedByTime(result) ? (
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Tempo esgotado: o simulado foi entregue automaticamente com as respostas salvas.
          </p>
        ) : null}
        {result.submittedAt ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Tempo usado: {formatMinutes(Math.max(60, usedSeconds))}
            {result.timeLimitSec ? ` de ${formatMinutes(result.timeLimitSec)}` : null}.
          </p>
        ) : null}
        {blank > 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {blank} {blank === 1 ? "questão ficou em branco" : "questões ficaram em branco"}.
          </p>
        ) : null}
        {summary.discursives.unevaluated > 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {summary.discursives.unevaluated}{" "}
            {summary.discursives.unevaluated === 1
              ? "discursiva respondida aguarda autoavaliação"
              : "discursivas respondidas aguardam autoavaliação"}
            .
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
    </main>
  );
}
