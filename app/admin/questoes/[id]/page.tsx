import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminImageManager } from "@/components/admin-image-manager";
import { ExamBadge } from "@/components/exam-badge";
import { PublishControls } from "@/components/publish-controls";
import { QuestionEditor } from "@/components/question-editor";
import { RichText } from "@/components/rich-text";
import { IMAGE_ERROR_MESSAGE, type ImageError } from "@/lib/admin-images";
import { openAttemptsWith, questionPublishProblems } from "@/lib/admin-publish";
import { adminQuestion, allTopics } from "@/lib/admin-questions";
import { resolveAssets } from "@/lib/assets";
import { requireAdmin } from "@/lib/dal";
import { AREA_LABEL, questionTitle, TYPE_LABEL } from "@/lib/questions";

export const metadata: Metadata = { title: "Editar questão — Painel" };

export default async function AdminQuestionPage(props: PageProps<"/admin/questoes/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const { salvo, imagem, erro } = await props.searchParams;
  const imageError =
    typeof erro === "string" && Object.hasOwn(IMAGE_ERROR_MESSAGE, erro)
      ? IMAGE_ERROR_MESSAGE[erro as ImageError]
      : null;
  const [question, topics, problems, openAttempts] = await Promise.all([
    adminQuestion(id),
    allTopics(),
    questionPublishProblems(id),
    openAttemptsWith(id),
  ]);
  if (!question) {
    notFound();
  }
  const assets = await resolveAssets(question.assets);
  const title = questionTitle(question.originalLabel, question.type);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href={`/admin/provas/${question.examId}`} className="text-sm underline">
        ← Voltar às questões da prova
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ExamBadge year={question.exam.year} />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {TYPE_LABEL[question.type]}
          </span>
          {question.publishedAt ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              Publicada
            </span>
          ) : (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              Rascunho
            </span>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar: {title}</h1>
        {question.publishedAt ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Esta questão está publicada: ao salvar, os alunos já passam a ver a versão nova.{" "}
            <Link href={`/questoes/${question.id}`} className="underline">
              Ver como o aluno vê
            </Link>
          </p>
        ) : null}
        {salvo === "1" ? (
          <p
            role="status"
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            Alterações salvas às{" "}
            {question.updatedAt.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Sao_Paulo",
            })}
            .
          </p>
        ) : null}
        {imagem === "ok" ? (
          <p
            role="status"
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          >
            Imagem enviada.
          </p>
        ) : null}
        {imageError ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {imageError}
          </p>
        ) : null}
      </header>

      <PublishControls
        key={question.publishedAt ? "publicada" : "rascunho"}
        questionId={question.id}
        published={question.publishedAt !== null}
        problems={problems}
        openAttempts={openAttempts}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <QuestionEditor
          key={question.updatedAt.getTime()}
          question={{
            id: question.id,
            type: question.type,
            area: question.area,
            status: question.status,
            statementMd: question.statementMd,
            valuePoints: question.valuePoints,
            updatedAt: question.updatedAt.getTime(),
            options: question.options,
            standards: question.answerStandards.map((standard) => ({
              id: standard.id,
              subItem: standard.subItem,
              maxScore: standard.maxScore,
              criteriaMd: standard.criteriaMd,
              assets: standard._count.assets,
            })),
            topics: question.tags.map((tag) => tag.topic.name),
            assetCount: question.assets.length,
          }}
          areas={Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }))}
          topics={topics}
        />
        <aside className="flex flex-col gap-3">
          <h2 className="font-semibold">Pré-visualização (versão salva)</h2>
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <RichText source={question.statementMd} assets={assets} />
            {question.type === "OBJECTIVE" ? (
              <ul className="flex flex-col gap-2">
                {question.options.map((option) => (
                  <li
                    key={option.letter}
                    className={`flex gap-3 rounded-lg border p-3 ${
                      option.isCorrect
                        ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <span className="font-semibold">{option.letter}</span>
                    <div className="min-w-0 flex-1">
                      <RichText source={option.textMd} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </aside>
      </div>
      <section aria-labelledby="imagens" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="imagens" className="text-lg font-semibold">
            Imagens
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            A 1ª imagem entra no 1º marcador “(ver imagem anexa…)” do texto, a 2ª no 2º, e assim por
            diante. Salve o texto antes de mexer nas imagens: enviar uma imagem recarrega a página.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminImageManager
            questionId={question.id}
            answerStandardId={null}
            title="Imagens do enunciado"
            assets={question.assets}
          />
          {question.answerStandards.map((standard) => (
            <AdminImageManager
              key={standard.id}
              questionId={question.id}
              answerStandardId={standard.id}
              title={`Imagens do padrão de resposta${standard.subItem ? ` — item ${standard.subItem})` : ""}`}
              assets={standard.assets}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
