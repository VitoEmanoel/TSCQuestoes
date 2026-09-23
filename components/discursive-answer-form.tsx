"use client";

import { useActionState, useState } from "react";
import { answerDiscursiveAction, type DiscursiveAnswerState } from "@/app/actions/practice";

export function DiscursiveAnswerForm({
  questionId,
  maxLength,
}: {
  questionId: string;
  maxLength: number;
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
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base leading-relaxed text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
      />
      <p id="answerText-help" className="text-sm text-zinc-500">
        {length}/{maxLength} caracteres. Depois de enviar, o padrão de resposta oficial aparece para
        você comparar e se autoavaliar.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Enviando..." : "Enviar resposta e ver o padrão"}
      </button>
    </form>
  );
}
