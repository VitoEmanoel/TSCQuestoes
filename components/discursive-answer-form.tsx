"use client";

import { useActionState, useState } from "react";
import { answerDiscursiveAction, type DiscursiveAnswerState } from "@/app/actions/practice";

const AFTER_SUBMIT = {
  IMMEDIATE:
    "Depois de enviar, o padrão de resposta oficial aparece para você comparar e se autoavaliar.",
  AT_END: "O padrão de resposta oficial aparece quando você finalizar a sessão.",
  MANUAL: "Depois de enviar, você abre o padrão de resposta oficial quando quiser.",
};

const SUBMIT_LABEL = {
  IMMEDIATE: "Enviar resposta e ver o padrão",
  AT_END: "Enviar resposta",
  MANUAL: "Enviar resposta",
};

export function DiscursiveAnswerForm({
  questionId,
  maxLength,
  policy,
}: {
  questionId: string;
  maxLength: number;
  policy: keyof typeof AFTER_SUBMIT;
}) {
  const [state, action, pending] = useActionState<DiscursiveAnswerState, FormData>(
    answerDiscursiveAction,
    {},
  );
  const [length, setLength] = useState(state.values?.answerText?.length ?? 0);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="questionId" value={questionId} />
      <label htmlFor="answerText" className="font-medium">
        Sua resposta
      </label>
      <textarea
        id="answerText"
        name="answerText"
        rows={12}
        maxLength={maxLength}
        required
        defaultValue={state.values?.answerText}
        onChange={(event) => setLength(event.target.value.length)}
        aria-describedby="answerText-help"
        className="focus:border-accent focus:ring-accent/15 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base leading-relaxed text-zinc-900 outline-none focus:ring-4 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <p id="answerText-help" className="text-sm text-zinc-500">
        {length}/{maxLength} caracteres. {AFTER_SUBMIT[policy]}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center self-start rounded-lg px-5 font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "Enviando..." : SUBMIT_LABEL[policy]}
      </button>
    </form>
  );
}
