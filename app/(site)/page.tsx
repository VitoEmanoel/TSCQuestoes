import Link from "next/link";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { openSimulados } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { PUBLISHED } from "@/lib/questions";

const FEATURES = [
  {
    title: "Questões por tema",
    text: "Filtre por ano, tema ou tipo e veja a correção na hora.",
  },
  {
    title: "Simulados com tempo",
    text: "Refaça uma prova inteira ou monte a sua, com cronômetro.",
  },
  {
    title: "Onde estudar mais",
    text: "O resultado mostra os temas em que você mais erra.",
  },
];

const PATHS = [
  { href: "/questoes", title: "Questões", text: "Resolva e confira na hora." },
  { href: "/simulados", title: "Simulados", text: "Prova completa ou personalizada." },
  { href: "/historico", title: "Histórico", text: "Sua evolução por tema." },
];

async function stats() {
  const [questions, exams] = await Promise.all([
    prisma.question.count({ where: { ...PUBLISHED, status: "VALID" } }),
    prisma.exam.findMany({
      where: { questions: { some: PUBLISHED } },
      orderBy: { year: "asc" },
      select: { year: true },
    }),
  ]);
  return { questions, exams: exams.map((exam) => exam.year) };
}

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    const open = await openSimulados(user.id);
    const firstName = user.name?.trim().split(/\s+/)[0];
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-14">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {firstName ? `Olá, ${firstName}.` : "Olá."}
        </h1>
        {open[0] ? (
          <Link
            href={`/simulados/${open[0].id}`}
            className="border-accent/40 bg-accent-soft flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm"
          >
            <span>
              Simulado em andamento: {open[0].answered} de {open[0].total} respondidas
            </span>
            <span className="text-accent font-medium">Continuar →</span>
          </Link>
        ) : null}
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {PATHS.map((path) => (
            <li key={path.href}>
              <Link href={path.href} className="group flex items-center justify-between gap-4 py-5">
                <span>
                  <span className="block font-serif text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {path.title}
                  </span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{path.text}</span>
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
      </main>
    );
  }

  const { questions, exams } = await stats();
  const span =
    exams.length > 1
      ? `${exams[0]} a ${exams[exams.length - 1]}`
      : exams[0]
        ? String(exams[0])
        : "";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-16 sm:py-24">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        ENADE · Tecnologia em Análise e Desenvolvimento de Sistemas
      </p>
      <h1 className="mt-4 max-w-xl text-4xl leading-tight font-semibold text-zinc-900 sm:text-5xl dark:text-zinc-50">
        Estude para o ENADE com as provas reais.
      </h1>
      <p className="mt-5 text-zinc-600 dark:text-zinc-400">
        {questions} questões · {exams.length} provas ({span}) · simulados com correção
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/cadastro" className={buttonPrimary}>
          Começar a estudar
        </Link>
        <Link href="/login" className={buttonSecondary}>
          Já tenho conta
        </Link>
      </div>
      <ul className="mt-16 grid gap-8 border-t border-zinc-200 pt-10 sm:grid-cols-3 dark:border-zinc-800">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">{feature.title}</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{feature.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
