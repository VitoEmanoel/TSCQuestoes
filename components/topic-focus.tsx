import Link from "next/link";
import type { TopicPerformance } from "@/lib/scoring";

export const REVIEW_THRESHOLD = 60;

function formatScore(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function TopicFocus({
  topics,
  blanksCount = false,
}: {
  topics: TopicPerformance[];
  blanksCount?: boolean;
}) {
  if (topics.length === 0) {
    return null;
  }
  const weak = topics.filter(
    (topic) => topic.percent !== null && topic.percent < REVIEW_THRESHOLD,
  ).length;
  return (
    <section aria-labelledby="temas-titulo" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="temas-titulo" className="text-lg font-semibold">
          Onde estudar mais
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {weak > 0
            ? `${weak} ${weak === 1 ? "tema ficou" : "temas ficaram"} abaixo de ${REVIEW_THRESHOLD}% nas objetivas. Os piores aparecem primeiro${blanksCount ? "; questões em branco contam como não acertadas" : ""}.`
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
  );
}
