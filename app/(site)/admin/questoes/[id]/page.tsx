import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteQuestionAction } from "@/app/actions/admin-manage";
import { AdminImageManager } from "@/components/admin-image-manager";
import { RenameQuestionForm } from "@/components/rename-question-form";
import { ExamBadge } from "@/components/exam-badge";
import { PublishControls } from "@/components/publish-controls";
import { QuestionEditor } from "@/components/question-editor";
import { RichText } from "@/components/rich-text";
import { IMAGE_ERROR_MESSAGE, type ImageError } from "@/lib/admin-images";
import { openAttemptsWith, questionPublishProblems } from "@/lib/admin-publish";
import { questionUsage } from "@/lib/admin-manage";
import { adminQuestion, allTopics } from "@/lib/admin-questions";
import { resolveAssets } from "@/lib/assets";
import { requireAdmin } from "@/lib/dal";
import { AREA_LABEL, questionTitle, TYPE_LABEL } from "@/lib/questions";
import {
  backLink,
  buttonDanger,
  dangerPanel,
  noticeError,
  noticeSuccess,
  panel,
  pill,
} from "@/components/ui";

export const metadata: Metadata = { title: "Editar questão — Painel" };

export default async function AdminQuestionPage(props: PageProps<"/admin/questoes/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const { salvo, imagem, erro, nova } = await props.searchParams;
  const imageError =
    typeof erro === "string" && Object.hasOwn(IMAGE_ERROR_MESSAGE, erro)
      ? IMAGE_ERROR_MESSAGE[erro as ImageError]
      : null;
  const [question, topics, problems, openAttempts, usage] = await Promise.all([
    adminQuestion(id),
    allTopics(),
    questionPublishProblems(id),
    openAttemptsWith(id),
    questionUsage(id),
  ]);
  if (!question) {
    notFound();
  }
  const assets = await resolveAssets(question.assets);
  const title = questionTitle(question.originalLabel, question.type);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href={`/admin/provas/${question.examId}`} className={backLink}>
        ← Voltar às questões da prova
      </Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ExamBadge year={question.exam.year} />
          <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {TYPE_LABEL[question.type]}
          </span>
          {question.publishedAt ? (
            <span className={pill.accent}>Publicada</span>
          ) : (
            <span className={pill.neutral}>Rascunho</span>
          )}
        </div>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Editar: {title}</h1>
        <RenameQuestionForm questionId={question.id} label={question.originalLabel} />
        {nova === "1" ? (
          <p role="status" className={noticeSuccess}>
            Questão criada como rascunho. Escreva o enunciado, preencha o resto e salve.
          </p>
        ) : null}
        {erro === "em-uso" || erro === "confirmacao" ? (
          <p role="alert" className={noticeError}>
            {erro === "em-uso"
              ? "Não dá para excluir: esta questão já foi usada por alunos. Volte-a para rascunho para tirá-la da vista deles."
              : "Marque a confirmação para excluir a questão."}
          </p>
        ) : null}
        {question.reviewedAt ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Revisada em{" "}
            {question.reviewedAt.toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Sao_Paulo",
            })}
            .
          </p>
        ) : (
          <p className={noticeError}>
            <strong className="text-alert">Não revisada:</strong> Esta questão veio do cadastro
            automático. Confira tudo com a prova original e salve para marcá-la como revisada.
          </p>
        )}
        {question.publishedAt ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Esta questão está publicada: ao salvar, os alunos já passam a ver a versão nova.{" "}
            <Link
              href={`/questoes/${question.id}`}
              className="text-accent underline-offset-4 hover:underline"
            >
              Ver como o aluno vê
            </Link>
          </p>
        ) : null}
        {salvo === "1" ? (
          <p role="status" className={noticeSuccess}>
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
          <p role="status" className={noticeSuccess}>
            Imagem enviada.
          </p>
        ) : null}
        {imageError ? (
          <p role="alert" className={noticeError}>
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
          <h2 className="text-lg font-semibold">Pré-visualização</h2>
          <p className="-mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Versão salva, como o aluno vê.
          </p>
          <div className={`${panel} flex flex-col gap-4`}>
            <RichText source={question.statementMd} assets={assets} />
            {question.type === "OBJECTIVE" ? (
              <ul className="flex flex-col gap-2">
                {question.options.map((option) => (
                  <li
                    key={option.letter}
                    className={`flex gap-3 rounded-lg border p-3 ${
                      option.isCorrect
                        ? "border-accent bg-accent-soft"
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
      <section aria-labelledby="excluir" className={dangerPanel}>
        <h2 id="excluir" className="text-alert text-lg font-semibold">
          Excluir questão
        </h2>
        {usage.total === 0 ? (
          <form action={deleteQuestionAction} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="questionId" value={question.id} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="confirmacao" value="sim" required />
              Apagar de vez esta questão, as alternativas, o padrão e as imagens dela
            </label>
            <button type="submit" className={buttonDanger}>
              Excluir questão
            </button>
          </form>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Não dá para excluir:{" "}
            {usage.answers > 0
              ? `${usage.answers} ${usage.answers === 1 ? "resposta de aluno" : "respostas de alunos"}`
              : ""}
            {usage.answers > 0 && usage.attempts + usage.rooms > 0 ? " e " : ""}
            {usage.attempts + usage.rooms > 0 ? "está em simulados ou salas" : ""}. Para tirar da
            vista dos alunos sem apagar o histórico deles, use “Voltar para rascunho” no topo.
          </p>
        )}
      </section>
    </main>
  );
}
