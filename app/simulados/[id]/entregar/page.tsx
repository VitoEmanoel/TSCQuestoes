import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitSimuladoAction } from "@/app/actions/simulados";
import { SimuladoBadge } from "@/components/simulado-badge";
import { requireUser } from "@/lib/dal";
import { questionTitle } from "@/lib/questions";
import { simuladoOverview } from "@/lib/simulados";

export const metadata: Metadata = { title: "Entregar simulado — TSCQuestões" };

export default async function EntregarSimuladoPage(props: PageProps<"/simulados/[id]/entregar">) {
  const { id } = await props.params;
  const user = await requireUser(`/simulados/${encodeURIComponent(id)}/entregar`);
  const overview = await simuladoOverview(user.id, id);
  if (!overview) {
    notFound();
  }
  const base = `/simulados/${encodeURIComponent(id)}`;
  if (overview.attempt.status !== "IN_PROGRESS") {
    redirect(`${base}/resultado`);
  }
  const blank = overview.questions
    .map((question, index) => ({ ...question, position: index + 1 }))
    .filter((question) => question.answer === null);
  const total = overview.questions.length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href={base} className="text-sm underline">
        ← Voltar ao simulado
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <SimuladoBadge year={overview.year} />
          <h1 className="text-2xl font-semibold tracking-tight">Entregar simulado</h1>
        </div>
        <p className="text-zinc-700 dark:text-zinc-300">
          Você respondeu {total - blank.length} de {total} questões. Depois de entregar, não dá mais
          para mudar as respostas.
        </p>
      </header>
      {blank.length > 0 ? (
        <section
          aria-label="Questões em branco"
          className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <h2 className="font-semibold">
            {blank.length} {blank.length === 1 ? "questão em branco" : "questões em branco"}
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {blank.map((question) => (
              <li key={question.id}>
                <Link href={`${base}?q=${question.position}`} className="underline">
                  {overview.year !== null
                    ? questionTitle(question.originalLabel, question.type)
                    : `Questão ${question.position}`}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form action={submitSimuladoAction}>
        <input type="hidden" name="attemptId" value={overview.attempt.id} />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Entregar e ver a nota
        </button>
      </form>
    </main>
  );
}
