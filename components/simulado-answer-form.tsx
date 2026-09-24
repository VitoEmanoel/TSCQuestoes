"use client";

import { type ReactNode, useActionState, useState } from "react";
import { saveSimuladoAnswerAction, type SimuladoAnswerState } from "@/app/actions/simulados";

type OptionView = { letter: string; content: ReactNode };

export function SimuladoAnswerForm({
  attemptId,
  questionId,
  next,
  isLast,
  options,
  savedLetter,
  savedText,
  maxLength,
}: {
  attemptId: string;
  questionId: string;
  next: number;
  isLast: boolean;
  options: OptionView[] | null;
  savedLetter: string | null;
  savedText: string | null;
  maxLength: number;
}) {
  const [state, action, pending] = useActionState<SimuladoAnswerState, FormData>(
    saveSimuladoAnswerAction,
    {},
  );
  const initialText = state.values?.answerText ?? savedText ?? "";
  const [length, setLength] = useState(initialText.length);
  const saved = options ? savedLetter !== null : savedText !== null;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="attemptId" value={attemptId} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="next" value={next} />
      {options ? (
        <fieldset disabled={pending} className="flex flex-col gap-2">
          <legend className="sr-only">Alternativas</legend>
          {options.map((option) => (
            <label
              key={option.letter}
              className="has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:ring-accent/20 flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 transition-colors hover:border-zinc-400 has-[:checked]:ring-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-zinc-900 dark:border-zinc-800 dark:hover:border-zinc-600 dark:has-[:focus-visible]:outline-zinc-100"
            >
              <input
                type="radio"
                name="letter"
                value={option.letter}
                defaultChecked={savedLetter === option.letter}
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
      ) : (
        <>
          <label htmlFor="answerText" className="font-medium">
            Sua resposta
          </label>
          <textarea
            id="answerText"
            name="answerText"
            rows={12}
            maxLength={maxLength}
            required
            defaultValue={initialText}
            onChange={(event) => setLength(event.target.value.length)}
            aria-describedby="answerText-help"
            className="focus:border-accent focus:ring-accent/15 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base leading-relaxed text-zinc-900 outline-none focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <p id="answerText-help" className="text-sm text-zinc-500">
            {length}/{maxLength} caracteres. O padrão de resposta aparece só depois de entregar.
          </p>
        </>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium transition-colors disabled:opacity-60"
        >
          {pending ? "Salvando..." : isLast ? "Salvar resposta" : "Salvar e ir para a próxima"}
        </button>
        {saved ? (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">Resposta salva.</span>
        ) : null}
      </div>
    </form>
  );
}
