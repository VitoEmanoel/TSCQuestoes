import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExamBadge } from "@/components/exam-badge";
import { DiscursiveAnswerForm } from "@/components/discursive-answer-form";
import { ObjectiveAnswer } from "@/components/objective-answer";
import { RichText } from "@/components/rich-text";
import { SelfEvaluationForm } from "@/components/self-evaluation-form";
import { resolveAssets } from "@/lib/assets";
import { requireUser } from "@/lib/dal";
import {
  lastDiscursiveAnswer,
  lastObjectiveAnswer,
  MAX_ANSWER_LENGTH,
  scoreSlots,
} from "@/lib/practice";
import { AREA_LABEL, getQuestionDetail, questionTitle, TYPE_LABEL } from "@/lib/questions";

export const metadata: Metadata = { title: "Questão — TSCQuestões" };

function formatPoints(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${formatted} ${value === 1 ? "ponto" : "pontos"}`;
}

function describeLastAnswer(answer: {
  selectedLetter: string | null;
  isCorrect: boolean | null;
  answeredAt: Date;
}): string {
  const verdict = answer.isCorrect === null ? "" : answer.isCorrect ? " (acertou)" : " (errou)";
  const when = formatWhen(answer.answeredAt);
  return `Sua última resposta: alternativa ${answer.selectedLetter}${verdict}, em ${when}.`;
}

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export default async function QuestionPage(props: PageProps<"/questoes/[id]">) {
  const { id } = await props.params;
  const { nova } = await props.searchParams;
  const writingNew = nova === "1";
  const user = await requireUser(`/questoes/${encodeURIComponent(id)}`);

  const detail = await getQuestionDetail(id);
  if (!detail) {
    notFound();
  }
  const { question, previous, next } = detail;
  const statementAssets = await resolveAssets(question.assets);
  const standards = await Promise.all(
    question.answerStandards.map(async (standard) => ({
      ...standard,
      resolvedAssets: await resolveAssets(standard.assets),
    })),
  );
  const lastAnswer =
    question.type === "OBJECTIVE" ? await lastObjectiveAnswer(user.id, question.id) : null;
  const lastWritten =
    question.type === "DISCURSIVE" ? await lastDiscursiveAnswer(user.id, question.id) : null;
  const slots = question.type === "DISCURSIVE" ? await scoreSlots(question.id) : null;
  const revealed = Boolean(lastWritten) && !writingNew;
  const isAnulada = question.status === "ANULADA";
  const title = questionTitle(question.originalLabel, question.type);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/questoes" className="text-sm underline">
        ← Voltar para a lista
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ExamBadge year={question.exam.year} />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {AREA_LABEL[question.area]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {TYPE_LABEL[question.type]}
          </span>
          {question.tags
            .filter((tag) => tag.topic.name !== AREA_LABEL[question.area])
            .map((tag) => (
              <span
                key={tag.topic.name}
                className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800"
              >
                {tag.topic.name}
              </span>
            ))}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {isAnulada ? (
          <p
            role="note"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            Questão anulada pelo INEP. Ela continua disponível para estudo, mas não conta na nota.
          </p>
        ) : null}
      </header>

      <section aria-label="Enunciado">
        <RichText source={question.statementMd} assets={statementAssets} />
        {question.type === "DISCURSIVE" && question.valuePoints !== null ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Valor total: {formatPoints(question.valuePoints)}
          </p>
        ) : null}
      </section>

      {question.type === "OBJECTIVE" ? (
        <section aria-label="Alternativas" className="flex flex-col gap-3">
          <p className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
            {lastAnswer ? describeLastAnswer(lastAnswer) : null}
          </p>
          <ObjectiveAnswer
            questionId={question.id}
            options={question.options.map((option) => ({
              letter: option.letter,
              content: <RichText source={option.textMd} />,
            }))}
          />
        </section>
      ) : revealed && lastWritten ? (
        <section aria-label="Sua resposta e o padrão oficial" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold">Sua resposta</h2>
            <p className="text-sm whitespace-pre-wrap">{lastWritten.answerText}</p>
            <p className="text-xs text-zinc-500">
              Enviada em {formatWhen(lastWritten.answeredAt)}.{" "}
              <Link href={`/questoes/${question.id}?nova=1`} className="underline">
                Escrever nova resposta
              </Link>
            </p>
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold">Padrão de resposta oficial</h2>
            {standards.map((standard) => (
              <div key={standard.id} className="flex flex-col gap-2">
                {standard.subItem || standard.maxScore !== null ? (
                  <h3 className="font-medium">
                    {standard.subItem ? `Item ${standard.subItem})` : "Resposta esperada"}
                    {standard.maxScore !== null ? (
                      <span className="font-normal text-zinc-600 dark:text-zinc-400">
                        {" "}
                        — {formatPoints(standard.maxScore)}
                      </span>
                    ) : null}
                  </h3>
                ) : null}
                {standard.criteriaMd.trim() || standard.resolvedAssets.length > 0 ? (
                  <RichText source={standard.criteriaMd} assets={standard.resolvedAssets} />
                ) : (
                  <p className="text-zinc-600 italic dark:text-zinc-400">
                    O INEP não publicou padrão de resposta para esta questão. Compare sua resposta
                    com o enunciado e se autoavalie pelos critérios pedidos nele.
                  </p>
                )}
              </div>
            ))}
          </div>
          {slots ? (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="font-semibold">Sua autoavaliação</h2>
              {isAnulada ? (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Esta questão foi anulada: a nota fica registrada, mas não conta no seu desempenho.
                </p>
              ) : null}
              <SelfEvaluationForm
                itemId={lastWritten.id}
                slots={slots}
                initial={(lastWritten.selfScores as Record<string, number> | null) ?? null}
              />
            </div>
          ) : null}
        </section>
      ) : (
        <section aria-label="Responder" className="flex flex-col gap-2">
          <DiscursiveAnswerForm questionId={question.id} maxLength={MAX_ANSWER_LENGTH} />
          {lastWritten ? (
            <Link href={`/questoes/${question.id}`} className="text-sm underline">
              Ver sua última resposta ({formatWhen(lastWritten.answeredAt)})
            </Link>
          ) : null}
        </section>
      )}

      <nav aria-label="Navegação na prova" className="flex justify-between gap-4 text-sm">
        {previous ? (
          <Link href={`/questoes/${previous.id}`} className="underline">
            ← {questionTitle(previous.originalLabel, previous.type)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/questoes/${next.id}`} className="underline">
            {questionTitle(next.originalLabel, next.type)} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
