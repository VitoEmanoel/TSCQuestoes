import type { Metadata } from "next";
import Link from "next/link";
import { ExamBadge } from "@/components/exam-badge";
import { formatMinutes, SimuladoBadge } from "@/components/simulado-badge";
import { requireUser } from "@/lib/dal";
import { historyPage, openSimulados, scoreEvolution, topicHistory } from "@/lib/history";
import type { Trend } from "@/lib/scoring";
import { closeExpiredSimulados } from "@/lib/simulados";

export const metadata: Metadata = { title: "Histórico — TSCQuestões" };

const TREND_VIEW: Record<Trend, { symbol: string; label: string; className: string }> = {
  up: { symbol: "↑", label: "melhorando", className: "text-emerald-700 dark:text-emerald-400" },
  down: { symbol: "↓", label: "piorando", className: "text-red-700 dark:text-red-400" },
  steady: { symbol: "→", label: "estável", className: "text-zinc-600 dark:text-zinc-400" },
  unknown: {
    symbol: "·",
    label: "poucas respostas",
    className: "text-zinc-400 dark:text-zinc-500",
  },
};

function formatScore(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function formatDate(date: Date): string {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

function shortDate(date: Date | null): string {
  return date
    ? date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";
}

function modeLabel(mode: string, year: number | null): string {
  if (mode === "PRACTICE") {
    return "Sessão de estudo";
  }
  return year !== null ? `Prova completa ${year}` : "Simulado personalizado";
}

export default async function HistoryPage(props: PageProps<"/historico">) {
  const { pagina } = await props.searchParams;
  const user = await requireUser("/historico");
  await closeExpiredSimulados(user.id);
  const requested = Number(Array.isArray(pagina) ? pagina[0] : pagina);
  const [history, open, evolution, topics] = await Promise.all([
    historyPage(user.id, Number.isInteger(requested) ? requested : 1),
    openSimulados(user.id),
    scoreEvolution(user.id),
    topicHistory(user.id),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Seus simulados e sessões de estudo, a evolução da nota e como você está em cada tema.
        </p>
      </header>

      {open.length > 0 ? (
        <section aria-labelledby="andamento" className="flex flex-col gap-3">
          <h2 id="andamento" className="text-lg font-semibold">
            Em andamento
          </h2>
          <ul className="flex flex-col gap-2">
            {open.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm dark:border-sky-900 dark:bg-sky-950"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <SimuladoBadge year={attempt.year} />
                  {attempt.answered} de {attempt.total} respondidas · começou em{" "}
                  {formatDate(attempt.startedAt)}
                </span>
                <Link href={`/simulados/${attempt.id}`} className="font-medium underline">
                  Continuar
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="evolucao" className="flex flex-col gap-3">
        <h2 id="evolucao" className="text-lg font-semibold">
          Evolução da nota
        </h2>
        {evolution.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Entregue um simulado para começar a acompanhar a sua nota.{" "}
            <Link href="/simulados" className="underline">
              Ir para os simulados
            </Link>
          </p>
        ) : (
          <figure className="flex flex-col gap-2">
            <ol
              className="flex h-44 items-end gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              aria-label={`Notas dos últimos ${evolution.length} simulados, do mais antigo para o mais recente`}
            >
              {evolution.map((point) => (
                <li key={point.id} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  <Link
                    href={`/simulados/${point.id}/resultado`}
                    className="flex h-full flex-col items-center justify-end gap-1"
                    aria-label={`${modeLabel("CUSTOM", point.year)} em ${shortDate(point.submittedAt)}: ${formatScore(point.score)}%`}
                  >
                    <span className="text-xs font-semibold">{formatScore(point.score)}%</span>
                    <span
                      className={`w-full max-w-10 rounded-t-md ${point.score >= 60 ? "bg-emerald-500" : "bg-red-500"}`}
                      style={{ height: `${Math.max(2, point.score)}%` }}
                    />
                    <span className="text-[11px] text-zinc-500">
                      {shortDate(point.submittedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <figcaption className="text-xs text-zinc-500">
              Porcentagem de acerto nas objetivas válidas de cada simulado (sem anuladas). Verde a
              partir de 60%.
            </figcaption>
          </figure>
        )}
      </section>

      <section aria-labelledby="por-tema" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="por-tema" className="text-lg font-semibold">
            Desempenho por tema (tudo o que você já respondeu)
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Soma as objetivas corrigidas dos simulados e do estudo avulso. A tendência compara as
            suas respostas mais antigas com as mais recentes de cada tema.
          </p>
        </div>
        {topics.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ainda não há respostas corrigidas.{" "}
            <Link href="/questoes" className="underline">
              Resolver questões
            </Link>
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {topics.map((topic) => (
              <li
                key={topic.topic}
                className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/questoes?tema=${encodeURIComponent(topic.topic)}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {topic.topic}
                  </Link>
                  <span className={`text-sm font-medium ${TREND_VIEW[topic.trend].className}`}>
                    <span aria-hidden="true">{TREND_VIEW[topic.trend].symbol}</span>{" "}
                    {TREND_VIEW[topic.trend].label}
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  aria-hidden="true"
                >
                  <div
                    className={`h-full rounded-full ${topic.percent >= 60 ? "bg-emerald-500" : "bg-red-500"}`}
                    style={{ width: `${topic.percent}%` }}
                  />
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  {topic.correct} de {topic.total} certas ({formatScore(topic.percent)}%)
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tentativas" className="flex flex-col gap-3">
        <h2 id="tentativas" className="text-lg font-semibold">
          Tentativas encerradas{history.total > 0 ? ` (${history.total})` : ""}
        </h2>
        {history.attempts.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma tentativa encerrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.attempts.map((attempt) => {
              const href =
                attempt.mode === "PRACTICE"
                  ? `/questoes/sessao/${attempt.id}`
                  : `/simulados/${attempt.id}/resultado`;
              const used =
                attempt.submittedAt && attempt.mode !== "PRACTICE"
                  ? Math.max(
                      60,
                      Math.round(
                        (attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000,
                      ),
                    )
                  : null;
              return (
                <li key={attempt.id}>
                  <Link
                    href={href}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      {attempt.mode === "PRACTICE" ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                          Estudo
                        </span>
                      ) : attempt.year !== null ? (
                        <ExamBadge year={attempt.year} />
                      ) : (
                        <SimuladoBadge year={null} />
                      )}
                      <span className="font-medium">{modeLabel(attempt.mode, attempt.year)}</span>
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {attempt.submittedAt ? formatDate(attempt.submittedAt) : null}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {attempt.answered}
                        {attempt.mode === "PRACTICE" ? "" : ` de ${attempt.total}`} respondidas
                        {used !== null ? ` · ${formatMinutes(used)}` : null}
                      </span>
                      <span className="font-semibold">
                        {attempt.autoScore !== null ? `${formatScore(attempt.autoScore)}%` : "—"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {history.pageCount > 1 ? (
          <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
            {history.page > 1 ? (
              <Link href={`/historico?pagina=${history.page - 1}`} className="underline">
                ← Mais recentes
              </Link>
            ) : (
              <span />
            )}
            <span className="text-zinc-600 dark:text-zinc-400">
              Página {history.page} de {history.pageCount}
            </span>
            {history.page < history.pageCount ? (
              <Link href={`/historico?pagina=${history.page + 1}`} className="underline">
                Mais antigas →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
