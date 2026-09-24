"use client";

import { useActionState } from "react";
import { type ManageState, renameQuestionAction } from "@/app/actions/admin-manage";

export function RenameQuestionForm({ questionId, label }: { questionId: string; label: string }) {
  const [state, action, pending] = useActionState<ManageState, FormData>(renameQuestionAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="questionId" value={questionId} />
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Número na prova
        <input
          name="numero"
          defaultValue={state.saved ?? label}
          required
          className="min-h-11 w-28 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 font-medium transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {pending ? "Salvando..." : "Trocar número"}
      </button>
      <span aria-live="polite" className="w-full">
        {state.error ? (
          <span role="alert" className="text-red-700 dark:text-red-400">
            {state.error}
          </span>
        ) : state.saved ? (
          <span className="text-accent">Número trocado para {state.saved}.</span>
        ) : null}
      </span>
    </form>
  );
}
