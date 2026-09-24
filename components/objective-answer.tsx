"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useId, useState } from "react";
import {
  answerObjectiveAction,
  type ObjectiveAnswerState,
  revealObjectiveAction,
} from "@/app/actions/practice";
import type { PendingObjectiveResult, RevealedObjectiveResult } from "@/lib/practice";

type OptionView = { letter: string; content: ReactNode };

function optionTone(letter: string, result: RevealedObjectiveResult | undefined): string {
  if (!result) {
    return "border-zinc-200 hover:border-zinc-400 has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:ring-2 has-[:checked]:ring-accent/20 dark:border-zinc-800 dark:hover:border-zinc-600";
  }
  if (!result.isAnulada && letter === result.correctLetter) {
    return "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950";
  }
  if (letter === result.letter) {
    return result.isAnulada
      ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
      : "border-red-500 bg-red-50 dark:border-red-600 dark:bg-red-950";
  }
  return "border-zinc-200 opacity-70 dark:border-zinc-800";
}

function PendingMessage({ result }: { result: PendingObjectiveResult }) {
  return (
    <p className="bg-accent-soft rounded-lg px-4 py-3 text-zinc-800 dark:text-zinc-200">
      Resposta registrada: alternativa {result.letter}.{" "}
      {result.policy === "MANUAL" ? (
        "Clique em “Ver correção” quando quiser saber se acertou."
      ) : (
        <>
          A correção aparece quando você{" "}
          <Link href="/questoes" className="underline">
            finalizar a sessão
          </Link>
          .
        </>
      )}
    </p>
  );
}

function ResultMessage({ result }: { result: RevealedObjectiveResult }) {
  if (result.isAnulada) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Resposta registrada. Esta questão foi anulada pelo INEP, então não há alternativa correta
        oficial e ela não conta no seu desempenho.
      </p>
    );
  }
  return result.isCorrect ? (
    <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
      Você acertou! A alternativa correta é a {result.correctLetter}.
    </p>
  ) : (
    <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 font-medium text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      Você errou. Você marcou a {result.letter}; a alternativa correta é a {result.correctLetter}.
    </p>
  );
}

export function ObjectiveAnswer({
  questionId,
  options,
  initialPending,
}: {
  questionId: string;
  options: OptionView[];
  initialPending?: PendingObjectiveResult;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState<ObjectiveAnswerState, FormData>(
    answerObjectiveAction,
    initialPending ? { result: initialPending } : {},
  );
  const [revealState, revealAction, revealing] = useActionState<ObjectiveAnswerState, FormData>(
    revealObjectiveAction,
    {},
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const current = state.result && state.result.answeredAt !== dismissed ? state.result : undefined;
  const revealedNow =
    revealState.result?.status === "revealed" &&
    revealState.result.answeredAt !== dismissed &&
    (!current || revealState.result.itemId === current.itemId)
      ? revealState.result
      : undefined;
  const shown = revealedNow ?? current;
  const revealed = shown?.status === "revealed" ? shown : undefined;
  const awaiting = shown?.status === "pending" ? shown : undefined;

  return (
    <div className="flex flex-col gap-3">
      <form id={formId} action={action} className="flex flex-col gap-3">
        <input type="hidden" name="questionId" value={questionId} />
        <fieldset disabled={Boolean(shown) || pending} className="flex flex-col gap-2">
          <legend className="sr-only">Alternativas</legend>
          {options.map((option) => (
            <label
              key={option.letter}
              className={`has-[:focus-visible]:outline-accent flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:disabled]:cursor-default has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${optionTone(option.letter, revealed)}`}
            >
              <input
                type="radio"
                name="letter"
                value={option.letter}
                defaultChecked={shown?.letter === option.letter}
                key={`${option.letter}-${shown?.answeredAt ?? "novo"}`}
                className="sr-only"
                required
              />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                {option.letter}
              </span>
              <div className="min-w-0 flex-1">{option.content}</div>
            </label>
          ))}
        </fieldset>
      </form>

      {state.error && !shown ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {revealState.error && awaiting ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {revealState.error}
        </p>
      ) : null}

      <div aria-live="polite">
        {revealed ? <ResultMessage result={revealed} /> : null}
        {awaiting ? <PendingMessage result={awaiting} /> : null}
      </div>

      {shown ? (
        <div className="flex flex-wrap gap-2">
          {awaiting?.policy === "MANUAL" ? (
            <form action={revealAction}>
              <input type="hidden" name="itemId" value={awaiting.itemId} />
              <button
                type="submit"
                disabled={revealing}
                className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {revealing ? "Corrigindo..." : "Ver correção"}
              </button>
            </form>
          ) : null}
          <button
            type="button"
            onClick={() => setDismissed(shown.answeredAt)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Responder de novo
          </button>
        </div>
      ) : (
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center self-start rounded-lg px-5 font-medium transition-colors disabled:opacity-60"
        >
          {pending ? "Enviando..." : "Responder"}
        </button>
      )}
    </div>
  );
}
