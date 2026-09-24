import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamBadge } from "@/components/exam-badge";
import { formatMinutes, SimuladoBadge } from "@/components/simulado-badge";
import { requireUser } from "@/lib/dal";
import { questionTitle } from "@/lib/questions";
import { closedByTime, type ReviewOutcome, simuladoReview } from "@/lib/simulados";

export const metadata: Metadata = { title: "Resultado do simulado — TSCQuestões" };

const REVIEW_THRESHOLD = 60;

const FILTERS = {
  todas: { label: "Todas", outcomes: null },
  erradas: { label: "Erradas", outcomes: ["wrong"] },
  branco: { label: "Em branco", outcomes: ["blank"] },
  certas: { label: "Certas", outcomes: ["correct"] },
  discursivas: { label: "Discursivas", outcomes: ["discursive"] },
} as const satisfies Record<string, { label: string; outcomes: readonly ReviewOutcome[] | null }>;

type FilterKey = keyof typeof FILTERS;

const OUTCOME_VIEW: Record<ReviewOutcome, { label: string; className: string }> = {
  correct: {
    label: "Acertou",
    className: "bg-accent-soft text-accent",
  },
  wrong: {
    label: "Errou",
    className: "bg-alert/15 text-alert",
  },
  blank: {
    label: "Em branco",
    className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  },
  anulada: {
    label: "Anulada",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  },
  discursive: {
    label: "Discursiva",
    className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  },
};

function formatScore(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default async function SimuladoResultPage(props: PageProps<"/simulados/[id]/resultado">) {
  const { id } = await props.params;
  const { ver } = await props.searchParams;
  const user = await requireUser(`/simulados/${encodeURIComponent(id)}/resultado`);
  const review = await simuladoReview(user.id, id);
  if (!review) {
    notFound();
  }
  const { result, rows, topics } = review;
  const { summary } = result;
  const base = `/simulados/${encodeURIComponent(id)}`;
  const anuladas = rows.filter((row) => row.anulada).length;
  const blank = rows.filter((row) => row.outcome === "blank").length;
  const usedSeconds = result.submittedAt
    ? Math.round((result.submittedAt.getTime() - result.startedAt.getTime()) / 1000)
    : 0;
  const requested = Array.isArray(ver) ? ver[0] : ver;
  const filter: FilterKey =
    requested && Object.hasOwn(FILTERS, requested) ? (requested as FilterKey) : "todas";
  const allowed: readonly ReviewOutcome[] | null = FILTERS[filter].outcomes;
  const visible = allowed ? rows.filter((row) => allowed.includes(row.outcome)) : rows;
  const weak = topics.filter(
    (topic) => topic.percent !== null && topic.percent < REVIEW_THRESHOLD,
  ).length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/simulados" className="tap text-sm underline">
        ← Voltar para os simulados
      </Link>
      <header className="flex items-center gap-2">
        <SimuladoBadge year={result.year} />
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Simulado entregue
        </h1>
      </header>

      <section
        aria-label="Nota"
        className="flex flex-col gap-1 border-y border-zinc-200 py-6 dark:border-zinc-800"
      >
        <p className="flex items-baseline gap-3">
          <span className="font-serif text-5xl font-semibold text-zinc-900 dark:text-zinc-50">
            {summary.percent !== null ? `${formatScore(summary.percent)}%` : "—"}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            {summary.objectives.correct} de {summary.objectives.counted}{" "}
            {summary.objectives.counted === 1 ? "objetiva certa" : "objetivas certas"}
          </span>
        </p>
        {summary.discursives.evaluated > 0 ? (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Discursivas autoavaliadas: {formatScore(summary.discursives.points)} de{" "}
            {formatScore(summary.discursives.max)} pontos.
          </p>
        ) : null}
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
            : abra na lista abaixo para comparar com o padrão oficial.
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

      <section aria-labelledby="temas-titulo" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="temas-titulo" className="text-lg font-semibold">
            Onde estudar mais
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {weak > 0
              ? `${weak} ${weak === 1 ? "tema ficou" : "temas ficaram"} abaixo de ${REVIEW_THRESHOLD}% nas objetivas. Os piores aparecem primeiro; questões em branco contam como não acertadas.`
              : `Nenhum tema abaixo de ${REVIEW_THRESHOLD}% nas objetivas. Os piores aparecem primeiro.`}
          </p>
        </div>
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {topics.map((topic) => {
            const needsReview = topic.percent !== null && topic.percent < REVIEW_THRESHOLD;
            return (
              <li key={topic.topic} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    {topic.topic}
                    {needsReview ? (
                      <span className="bg-alert rounded-md px-1.5 py-0.5 text-xs font-semibold text-white dark:text-zinc-950">
                        Revisar
                      </span>
                    ) : null}
                  </span>
                  <Link
                    href={`/questoes?tema=${encodeURIComponent(topic.topic)}`}
                    className="tap text-accent text-sm underline-offset-4 hover:underline"
                  >
                    Estudar este tema
                  </Link>
                </div>
                {topic.total > 0 ? (
                  <>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full rounded-full ${needsReview ? "bg-alert" : "bg-accent"}`}
                        style={{ width: `${topic.percent ?? 0}%` }}
                      />
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Objetivas: {topic.correct} de {topic.total} certas (
                      {formatScore(topic.percent ?? 0)}%)
                      {topic.wrong > 0
                        ? ` · ${topic.wrong} ${topic.wrong === 1 ? "errada" : "erradas"}`
                        : null}
                      {topic.blank > 0 ? ` · ${topic.blank} em branco` : null}
                    </p>
                  </>
                ) : null}
                {topic.discursive.total > 0 ? (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Discursivas: {topic.discursive.total}
                    {topic.discursive.max > 0
                      ? ` · autoavaliação ${formatScore(topic.discursive.points)} de ${formatScore(topic.discursive.max)} pontos`
                      : null}
                    {topic.discursive.pending > 0
                      ? ` · ${topic.discursive.pending} sem autoavaliação`
                      : null}
                    {topic.discursive.blank > 0 ? ` · ${topic.discursive.blank} em branco` : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="questoes-titulo" className="flex flex-col gap-3">
        <h2 id="questoes-titulo" className="text-lg font-semibold">
          Questões
        </h2>
        <nav aria-label="Filtrar questões" className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(FILTERS) as FilterKey[]).map((key) => {
            const outcomes: readonly ReviewOutcome[] | null = FILTERS[key].outcomes;
            const count = outcomes
              ? rows.filter((row) => outcomes.includes(row.outcome)).length
              : rows.length;
            return (
              <Link
                key={key}
                href={key === "todas" ? `${base}/resultado` : `${base}/resultado?ver=${key}`}
                aria-current={filter === key ? "page" : undefined}
                className={`rounded-full border px-3 py-1 ${
                  filter === key
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
                }`}
              >
                {FILTERS[key].label} ({count})
              </Link>
            );
          })}
        </nav>
        {visible.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma questão neste filtro.</p>
        ) : (
          <ol className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {visible.map((row) => (
              <li key={row.id}>
                <Link
                  href={`${base}/revisao?q=${row.position}`}
                  className="group flex flex-col gap-1 py-3"
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_VIEW[row.outcome].className}`}
                    >
                      {OUTCOME_VIEW[row.outcome].label}
                    </span>
                    {result.year === null ? <ExamBadge year={row.year} /> : null}
                    <span className="font-semibold">
                      {result.year === null
                        ? `Questão ${row.position}`
                        : questionTitle(row.originalLabel, row.type)}
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {row.topics.join(", ")}
                    </span>
                  </span>
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">
                    {row.outcome === "correct"
                      ? `Você marcou a ${row.selectedLetter}.`
                      : row.outcome === "wrong"
                        ? `Você marcou a ${row.selectedLetter}; a correta é a ${row.correctLetter}.`
                        : row.outcome === "blank"
                          ? row.type === "OBJECTIVE"
                            ? `Não respondida; a correta é a ${row.correctLetter}.`
                            : "Não respondida."
                          : row.outcome === "anulada"
                            ? "Anulada pelo INEP: não conta na nota."
                            : row.selfScore !== null
                              ? `Autoavaliação: ${formatScore(row.selfScore)} de ${formatScore(row.maxPoints)}.`
                              : "Compare com o padrão oficial e se autoavalie."}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
