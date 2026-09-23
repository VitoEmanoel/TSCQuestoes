"use client";

import { type ReactNode, useActionState, useState } from "react";
import { answerObjectiveAction, type ObjectiveAnswerState } from "@/app/actions/practice";

type OptionView = { letter: string; content: ReactNode };

function optionTone(letter: string, result: ObjectiveAnswerState["result"]): string {
  if (!result) {
    return "border-zinc-200 hover:border-zinc-400 has-[:checked]:border-zinc-900 has-[:checked]:ring-2 has-[:checked]:ring-zinc-900/20 dark:border-zinc-800 dark:hover:border-zinc-600 dark:has-[:checked]:border-zinc-100";
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

function ResultMessage({ result }: { result: NonNullable<ObjectiveAnswerState["result"]> }) {
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
}: {
  questionId: string;
  options: OptionView[];
}) {
  const [state, action, pending] = useActionState<ObjectiveAnswerState, FormData>(
    answerObjectiveAction,
    {},
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const result = state.result && state.result.answeredAt !== dismissed ? state.result : undefined;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="questionId" value={questionId} />
      <fieldset disabled={Boolean(result) || pending} className="flex flex-col gap-2">
        <legend className="sr-only">Alternativas</legend>
        {options.map((option) => (
          <label
            key={option.letter}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors has-[:disabled]:cursor-default has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-900 dark:has-[:focus-visible]:outline-zinc-100 ${optionTone(option.letter, result)}`}
          >
            <input
              type="radio"
              name="letter"
              value={option.letter}
              defaultChecked={result?.letter === option.letter}
              key={`${option.letter}-${result?.answeredAt ?? "novo"}`}
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

      {state.error && !result ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <div aria-live="polite">{result ? <ResultMessage result={result} /> : null}</div>

      {result ? (
        <button
          type="button"
          onClick={() => setDismissed(result.answeredAt)}
          className="self-start rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Responder de novo
        </button>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Corrigindo..." : "Responder"}
        </button>
      )}
    </form>
  );
}
