import Link from "next/link";
import { StudentDashboard } from "@/components/student-dashboard";
import { buttonPrimary, buttonSecondary } from "@/components/ui";
import { getCurrentUser } from "@/lib/dal";
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
    return <StudentDashboard userId={user.id} name={user.name} />;
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
