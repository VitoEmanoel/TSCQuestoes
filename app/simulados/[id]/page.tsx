import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExamBadge } from "@/components/exam-badge";
import { formatMinutes, SimuladoBadge } from "@/components/simulado-badge";
import { SimuladoTimer } from "@/components/simulado-timer";
import { RichText } from "@/components/rich-text";
import { SimuladoAnswerForm } from "@/components/simulado-answer-form";
import { resolveAssets } from "@/lib/assets";
import { requireUser } from "@/lib/dal";
import { AREA_LABEL, questionTitle, TYPE_LABEL } from "@/lib/questions";
import {
  closeIfExpired,
  MAX_SIMULADO_ANSWER_LENGTH,
  remainingSeconds,
  simuladoOverview,
  simuladoQuestion,
} from "@/lib/simulados";

export const metadata: Metadata = { title: "Simulado — TSCQuestões" };

export default async function SimuladoPage(props: PageProps<"/simulados/[id]">) {
  const { id } = await props.params;
  const { q, pedidas } = await props.searchParams;
  const user = await requireUser(`/simulados/${encodeURIComponent(id)}`);
  await closeIfExpired(user.id, id);
  const overview = await simuladoOverview(user.id, id);
  if (!overview) {
    notFound();
  }
  if (overview.attempt.status !== "IN_PROGRESS") {
    redirect(`/simulados/${encodeURIComponent(id)}/resultado`);
  }
  const total = overview.questions.length;
  const requested = Number(Array.isArray(q) ? q[0] : q);
  const position =
    Number.isInteger(requested) && requested >= 1 && requested <= total ? requested : 1;
  const current = overview.questions[position - 1];
  const question = await simuladoQuestion(current.id);
  if (!question) {
    notFound();
  }
  const assets = await resolveAssets(question.assets);
  const answered = overview.questions.filter((item) => item.answer !== null).length;
  const base = `/simulados/${encodeURIComponent(id)}`;
  const remaining = remainingSeconds(overview.attempt);
  const requestedCount = Number(Array.isArray(pedidas) ? pedidas[0] : pedidas);
  const shortOfRequest =
    Number.isInteger(requestedCount) && requestedCount > total ? requestedCount : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SimuladoBadge year={overview.year} />
            <span className="font-semibold">
              {overview.year !== null ? "Simulado — prova completa" : "Simulado personalizado"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {remaining !== null ? <SimuladoTimer remainingSeconds={remaining} /> : null}
            <Link
              href={`${base}/entregar`}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Entregar simulado
            </Link>
          </div>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {answered} de {total} respondidas.
          {overview.attempt.timeLimitSec
            ? ` Tempo total: ${formatMinutes(overview.attempt.timeLimitSec)}. Ao acabar, o simulado é entregue com as respostas já salvas.`
            : null}
        </p>
        {shortOfRequest ? (
          <p
            role="note"
            className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
          >
            Você pediu {shortOfRequest} questões, mas só havia {total} válidas com esses filtros.
          </p>
        ) : null}
        <nav aria-label="Questões do simulado">
          <ol className="flex flex-wrap gap-1.5">
            {overview.questions.map((item, index) => {
              const isCurrent = index + 1 === position;
              const tone = isCurrent
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : item.answer
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                  : "border-zinc-300 text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300";
              return (
                <li key={item.id}>
                  <Link
                    href={`${base}?q=${index + 1}`}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-label={`${overview.year !== null ? questionTitle(item.originalLabel, item.type) : `Questão ${index + 1} de ${total}`}${item.answer ? ", respondida" : ", em branco"}`}
                    className={`flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 text-xs font-medium ${tone}`}
                  >
                    {overview.year !== null ? item.originalLabel : index + 1}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <section aria-label="Enunciado" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {overview.year === null ? <ExamBadge year={current.exam.year} /> : null}
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {AREA_LABEL[question.area]}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {TYPE_LABEL[question.type]}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {questionTitle(question.originalLabel, question.type)}{" "}
          <span className="text-base font-normal text-zinc-500">
            ({position} de {total})
          </span>
        </h1>
        {question.status === "ANULADA" ? (
          <p
            role="note"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
          >
            Questão anulada pelo INEP: pode responder, mas ela não conta na nota do simulado.
          </p>
        ) : null}
        <RichText source={question.statementMd} assets={assets} />
      </section>

      <section aria-label="Sua resposta">
        <SimuladoAnswerForm
          key={`${question.id}-${current.answer?.answeredAt.toISOString() ?? "vazio"}`}
          attemptId={overview.attempt.id}
          questionId={question.id}
          next={Math.min(position + 1, total)}
          isLast={position === total}
          options={
            question.type === "OBJECTIVE"
              ? question.options.map((option) => ({
                  letter: option.letter,
                  content: <RichText source={option.textMd} />,
                }))
              : null
          }
          savedLetter={current.answer?.selectedLetter ?? null}
          savedText={current.answer?.answerText ?? null}
          maxLength={MAX_SIMULADO_ANSWER_LENGTH}
        />
      </section>

      <nav aria-label="Anterior e próxima" className="flex justify-between gap-4 text-sm">
        {position > 1 ? (
          <Link href={`${base}?q=${position - 1}`} className="tap underline">
            ← Anterior
          </Link>
        ) : (
          <span />
        )}
        {position < total ? (
          <Link href={`${base}?q=${position + 1}`} className="tap underline">
            Próxima (sem salvar) →
          </Link>
        ) : (
          <Link href={`${base}/entregar`} className="tap underline">
            Revisar e entregar →
          </Link>
        )}
      </nav>
    </main>
  );
}
