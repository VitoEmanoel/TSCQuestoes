import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { moveQuestionAction } from "@/app/actions/admin-manage";
import { BulkPublishForm } from "@/components/bulk-publish-form";
import { NewQuestionForm } from "@/components/new-question-form";
import { ExamBadge } from "@/components/exam-badge";
import { deleteExamAction } from "@/app/actions/admin-import";
import { examDeletionBlockers } from "@/lib/admin-import";
import { adminExamQuestions } from "@/lib/admin-questions";
import { requireAdmin } from "@/lib/dal";
import { excerpt, questionTitle } from "@/lib/questions";

export const metadata: Metadata = { title: "Questões da prova — Painel" };

export default async function AdminExamPage(props: PageProps<"/admin/provas/[examId]">) {
  await requireAdmin();
  const { examId } = await props.params;
  const { importada, erro, excluida } = await props.searchParams;
  const exam = await adminExamQuestions(examId);
  if (!exam) {
    notFound();
  }
  const blockers = await examDeletionBlockers(exam.id);
  const drafts = exam.questions.filter((question) => question.publishedAt === null).length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href="/admin" className="tap text-sm underline">
        ← Voltar ao painel
      </Link>
      <header className="flex items-center gap-2">
        <ExamBadge year={exam.year} />
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          Questões da prova de {exam.year}
        </h1>
      </header>
      {importada === "1" ? (
        <p
          role="status"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Prova criada com {exam.questions.length} questões em rascunho. Abra cada uma para revisar,
          escolher os temas, adicionar as imagens e publicar.
        </p>
      ) : null}
      {erro === "confirmacao" || erro === "exclusao" ? (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {erro === "confirmacao"
            ? "Marque a confirmação para excluir a prova."
            : "Não foi possível excluir: a prova tem questão publicada ou já foi usada por alunos."}
        </p>
      ) : null}
      {excluida === "1" ? (
        <p role="status" className="text-accent text-sm font-medium">
          Questão excluída.
        </p>
      ) : null}
      <NewQuestionForm examId={exam.id} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {exam.questions.length} questões · {exam.questions.length - drafts} publicadas · {drafts} em
        rascunho
      </p>
      <BulkPublishForm examId={exam.id}>
        <ul className="flex flex-col gap-2">
          {exam.questions.map((question, index) => (
            <li key={question.id} className="flex items-stretch gap-2">
              <label className="flex items-center rounded-lg border border-zinc-200 px-3 dark:border-zinc-800">
                <input
                  type="checkbox"
                  name="ids"
                  value={question.id}
                  aria-label={`Selecionar ${questionTitle(question.originalLabel, question.type)}`}
                />
              </label>
              <div className="flex flex-col justify-center gap-1">
                <button
                  type="submit"
                  form={`mover-${question.id}-up`}
                  disabled={index === 0}
                  aria-label={`Subir ${questionTitle(question.originalLabel, question.type)}`}
                  className="inline-flex h-7 w-8 items-center justify-center rounded-md border border-zinc-200 text-xs hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  ↑
                </button>
                <button
                  type="submit"
                  form={`mover-${question.id}-down`}
                  disabled={index === exam.questions.length - 1}
                  aria-label={`Descer ${questionTitle(question.originalLabel, question.type)}`}
                  className="inline-flex h-7 w-8 items-center justify-center rounded-md border border-zinc-200 text-xs hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  ↓
                </button>
              </div>
              <Link
                href={`/admin/questoes/${question.id}`}
                className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-zinc-200 p-3 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
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
                  {question.reviewedAt === null ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-900/40 dark:text-red-200">
                      Não revisada
                    </span>
                  ) : null}
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
      </BulkPublishForm>
      {exam.questions.flatMap((question) =>
        (["up", "down"] as const).map((direction) => (
          <form
            key={`${question.id}-${direction}`}
            id={`mover-${question.id}-${direction}`}
            action={moveQuestionAction}
            hidden
          >
            <input type="hidden" name="mover" value={`${question.id}:${direction}`} />
          </form>
        )),
      )}
      <section
        aria-label="Excluir prova"
        className="flex flex-col gap-2 rounded-xl border border-red-200 p-4 dark:border-red-900"
      >
        <h2 className="font-semibold text-red-800 dark:text-red-300">Excluir prova</h2>
        {blockers.total === 0 ? (
          <form action={deleteExamAction} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="examId" value={exam.id} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="confirmacao" value="sim" required />
              Apagar a prova de {exam.year} e as {exam.questions.length} questões dela
            </label>
            <button
              type="submit"
              className="rounded-md border border-red-400 px-3 py-1.5 font-medium text-red-800 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
            >
              Excluir prova
            </button>
          </form>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Não dá para excluir:{" "}
            {blockers.published > 0 ? `${blockers.published} questões publicadas` : null}
            {blockers.published > 0 && blockers.answered + blockers.replays > 0 ? " e " : null}
            {blockers.answered + blockers.replays > 0 ? "já usada por alunos" : null}
            {blockers.rooms > 0 ? " (e em salas virtuais)" : null}. Para desfazer um cadastro
            errado, exclua antes de publicar qualquer questão.
          </p>
        )}
      </section>
    </main>
  );
}
