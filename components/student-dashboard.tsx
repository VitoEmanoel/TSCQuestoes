import Link from "next/link";
import { studentDashboard } from "@/lib/dashboard";
import { firstName as firstNameOf } from "@/lib/person-name";

const PATHS = [
  { href: "/questoes", title: "Questões", text: "Resolva e confira na hora." },
  { href: "/simulados", title: "Simulados", text: "Prova completa ou personalizada." },
  { href: "/historico", title: "Histórico", text: "Tudo o que você já fez." },
];

function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatDay(date: Date | null): string {
  return date
    ? date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";
}

function Paths({ compact }: { compact: boolean }) {
  return (
    <ul
      className={
        compact
          ? "grid gap-2 sm:grid-cols-3"
          : "divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
      }
    >
      {PATHS.map((path) => (
        <li key={path.href}>
          <Link
            href={path.href}
            className={
              compact
                ? "group flex min-h-11 items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                : "group flex items-center justify-between gap-4 py-5"
            }
          >
            <span>
              <span
                className={
                  compact
                    ? "block font-medium text-zinc-900 dark:text-zinc-100"
                    : "block font-serif text-xl font-semibold text-zinc-900 dark:text-zinc-50"
                }
              >
                {path.title}
              </span>
              {compact ? null : (
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{path.text}</span>
              )}
            </span>
            <span
              aria-hidden="true"
              className="group-hover:text-accent text-zinc-400 transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function StudentDashboard({ userId, name }: { userId: string; name: string | null }) {
  const data = await studentDashboard(userId);
  const firstName = firstNameOf(name);
  const empty = data.answered === 0 && data.simulados === 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-12 sm:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {firstName ? `Olá, ${firstName}.` : "Olá."}
        </h1>
        {empty ? (
          <p className="text-zinc-600 dark:text-zinc-400">
            Resolva algumas questões para ver seu desempenho aqui.
          </p>
        ) : null}
      </header>

      {data.open ? (
        <Link
          href={`/simulados/${data.open.id}`}
          className="border-accent/40 bg-accent-soft flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
        >
          <span>
            Simulado em andamento: {data.open.answered} de {data.open.total} respondidas
          </span>
          <span className="text-accent shrink-0 font-medium">Continuar →</span>
        </Link>
      ) : null}

      {empty ? (
        <Paths compact={false} />
      ) : (
        <>
          <section
            aria-label="Resumo"
            className="grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
          >
            {[
              { value: String(data.answered), label: "questões respondidas" },
              {
                value: data.accuracy === null ? "—" : formatPercent(data.accuracy),
                label: "de acerto nas objetivas",
              },
              { value: String(data.simulados), label: "simulados entregues" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1 px-3 py-5 first:pl-0 sm:px-6">
                <span className="font-serif text-3xl font-semibold text-zinc-900 sm:text-4xl dark:text-zinc-50">
                  {stat.value}
                </span>
                <span className="text-xs text-zinc-600 sm:text-sm dark:text-zinc-400">
                  {stat.label}
                </span>
              </div>
            ))}
          </section>

          {data.focus.length > 0 ? (
            <section aria-labelledby="focar" className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="focar" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  Onde focar
                </h2>
                <Link
                  href="/historico"
                  className="tap text-accent text-sm underline-offset-4 hover:underline"
                >
                  Ver histórico completo
                </Link>
              </div>
              <ul className="flex flex-col gap-4">
                {data.focus.map((topic) => (
                  <li key={topic.topic}>
                    <Link
                      href={`/questoes?tema=${encodeURIComponent(topic.topic)}`}
                      className="group flex flex-col gap-2"
                    >
                      <span className="flex items-baseline justify-between gap-4 text-sm">
                        <span className="font-medium text-zinc-900 group-hover:underline dark:text-zinc-100">
                          {topic.topic}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-400">
                          {formatPercent(topic.percent)} · {topic.correct} de {topic.total}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                      >
                        <span
                          className={`block h-full rounded-full ${topic.percent >= 60 ? "bg-accent" : "bg-alert"}`}
                          style={{ width: `${Math.max(2, topic.percent)}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.recent.length > 0 ? (
            <section aria-labelledby="ultimos" className="flex flex-col gap-4">
              <h2 id="ultimos" className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                Últimos simulados
              </h2>
              <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {data.recent.map((point) => (
                  <li key={point.id}>
                    <Link
                      href={`/simulados/${point.id}/resultado`}
                      className="flex min-h-12 items-center justify-between gap-4 text-sm hover:bg-zinc-100/60 dark:hover:bg-zinc-900"
                    >
                      <span className="flex items-center gap-3">
                        <span className="w-12 text-zinc-500">{formatDay(point.submittedAt)}</span>
                        <span className="text-zinc-900 dark:text-zinc-100">
                          {point.year !== null ? `Prova de ${point.year}` : "Personalizado"}
                        </span>
                      </span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {formatPercent(point.score)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <Paths compact />
        </>
      )}
    </main>
  );
}
