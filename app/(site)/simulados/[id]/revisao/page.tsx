import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerStandards, formatPoints } from "@/components/answer-standards";
import { ExamBadge } from "@/components/exam-badge";
import { RichText } from "@/components/rich-text";
import { SelfEvaluationForm } from "@/components/self-evaluation-form";
import { resolveAssets } from "@/lib/assets";
import { requireUser } from "@/lib/dal";
import { scoreSlots } from "@/lib/practice";
import { AREA_LABEL, getQuestionDetail, questionTitle, TYPE_LABEL } from "@/lib/questions";
import { simuladoReviewItem } from "@/lib/simulados";

export const metadata: Metadata = { title: "Revisão do simulado — TSCQuestões" };

function optionTone(letter: string, chosen: string | null, correct: string | null): string {
  if (letter === correct) {
    return "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950";
  }
  if (letter === chosen) {
    return "border-red-500 bg-red-50 dark:border-red-600 dark:bg-red-950";
  }
  return "border-zinc-200 opacity-70 dark:border-zinc-800";
}

export default async function SimuladoReviewPage(props: PageProps<"/simulados/[id]/revisao">) {
  const { id } = await props.params;
  const { q } = await props.searchParams;
  const user = await requireUser(`/simulados/${encodeURIComponent(id)}/resultado`);
  const requested = Number(Array.isArray(q) ? q[0] : q);
  const position = Number.isInteger(requested) && requested >= 1 ? requested : 1;
  const review = await simuladoReviewItem(user.id, id, position);
  if (!review) {
    notFound();
  }
  const detail = await getQuestionDetail(review.questionId, { publishedOnly: false });
  if (!detail) {
    notFound();
  }
  const { question } = detail;
  const base = `/simulados/${encodeURIComponent(id)}`;
  const isAnulada = question.status === "ANULADA";
  const chosen = review.item?.selectedLetter ?? null;
  const correct = isAnulada ? null : review.correctLetter;
  const statementAssets = await resolveAssets(question.assets);
  const standards =
    question.type === "DISCURSIVE"
      ? await Promise.all(
          question.answerStandards.map(async (standard) => ({
            ...standard,
            resolvedAssets: await resolveAssets(standard.assets),
          })),
        )
      : [];
  const slots = question.type === "DISCURSIVE" ? await scoreSlots(question.id) : null;
  const title =
    review.result.year === null
      ? `Questão ${position}`
      : questionTitle(question.originalLabel, question.type);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href={`${base}/resultado`} className="tap text-sm underline">
        ← Voltar ao resultado
      </Link>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ExamBadge year={question.exam.year} />
          <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {AREA_LABEL[question.area]}
          </span>
          <span className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
            {TYPE_LABEL[question.type]}
          </span>
          {question.tags
            .filter((tag) => tag.topic.name !== AREA_LABEL[question.area])
            .map((tag) => (
              <span
                key={tag.topic.name}
                className="rounded-md border border-zinc-200 px-1.5 py-0.5 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
              >
                {tag.topic.name}
              </span>
            ))}
        </div>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
          {title}{" "}
          <span className="text-base font-normal text-zinc-500">
            ({position} de {review.total})
          </span>
        </h1>
        {isAnulada ? (
          <p
            role="note"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            Questão anulada pelo INEP: não há gabarito oficial e ela não conta na nota.
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
        <section aria-label="Correção" className="flex flex-col gap-3">
          <p
            className={`rounded-md border px-3 py-2 font-medium ${
              isAnulada
                ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : chosen === null
                  ? "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  : chosen === correct
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {isAnulada
              ? chosen
                ? `Você marcou a ${chosen}. Questão anulada: não conta.`
                : "Você deixou em branco. Questão anulada: não conta."
              : chosen === null
                ? `Você deixou em branco. A alternativa correta é a ${correct}.`
                : chosen === correct
                  ? `Você acertou! A alternativa correta é a ${correct}.`
                  : `Você errou. Você marcou a ${chosen}; a alternativa correta é a ${correct}.`}
          </p>
          <ul className="flex flex-col gap-2">
            {question.options.map((option) => (
              <li
                key={option.letter}
                className={`flex gap-3 rounded-lg border p-3 ${optionTone(option.letter, chosen, correct)}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {option.letter}
                </span>
                <div className="min-w-0 flex-1">
                  <RichText source={option.textMd} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Sua resposta e o padrão oficial" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="font-semibold">Sua resposta</h2>
            {review.item?.answerText ? (
              <p className="text-sm whitespace-pre-wrap">{review.item.answerText}</p>
            ) : (
              <p className="text-sm text-zinc-600 italic dark:text-zinc-400">
                Você deixou esta questão em branco.
              </p>
            )}
          </div>
          <AnswerStandards standards={standards} />
          {slots && review.item?.answerText ? (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="font-semibold">Sua autoavaliação</h2>
              {isAnulada ? (
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Esta questão foi anulada: a nota fica registrada, mas não conta no seu desempenho.
                </p>
              ) : null}
              <SelfEvaluationForm
                itemId={review.item.id}
                slots={slots}
                initial={(review.item.selfScores as Record<string, number> | null) ?? null}
              />
            </div>
          ) : null}
        </section>
      )}

      <nav aria-label="Anterior e próxima" className="flex justify-between gap-4 text-sm">
        {position > 1 ? (
          <Link href={`${base}/revisao?q=${position - 1}`} className="tap underline">
            ← Anterior
          </Link>
        ) : (
          <span />
        )}
        {position < review.total ? (
          <Link href={`${base}/revisao?q=${position + 1}`} className="tap underline">
            Próxima →
          </Link>
        ) : (
          <Link href={`${base}/resultado`} className="tap underline">
            Voltar ao resultado →
          </Link>
        )}
      </nav>
    </main>
  );
}
