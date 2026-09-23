import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamBadge } from "@/components/exam-badge";
import { adminExamQuestions } from "@/lib/admin-questions";
import { requireAdmin } from "@/lib/dal";
import { excerpt, questionTitle } from "@/lib/questions";

export const metadata: Metadata = { title: "Questões da prova — Painel" };

export default async function AdminExamPage(props: PageProps<"/admin/provas/[examId]">) {
  await requireAdmin();
  const { examId } = await props.params;
  const exam = await adminExamQuestions(examId);
  if (!exam) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href="/admin" className="text-sm underline">
        ← Voltar ao painel
      </Link>
      <header className="flex items-center gap-2">
        <ExamBadge year={exam.year} />
        <h1 className="text-2xl font-semibold tracking-tight">Questões da prova de {exam.year}</h1>
      </header>
      <ul className="flex flex-col gap-2">
        {exam.questions.map((question) => (
          <li key={question.id}>
            <Link
              href={`/admin/questoes/${question.id}`}
              className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">
                  {questionTitle(question.originalLabel, question.type)}
                </span>
                {question.publishedAt ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
                    Publicada
                  </span>
                ) : (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    Rascunho
                  </span>
                )}
                {question.status === "ANULADA" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                    Anulada
                  </span>
                ) : null}
                {question._count.assets > 0 ? (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {question._count.assets} {question._count.assets === 1 ? "imagem" : "imagens"}
                  </span>
                ) : null}
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {question.tags.map((tag) => tag.topic.name).join(", ")}
                </span>
              </span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {excerpt(question.statementMd, 160)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
