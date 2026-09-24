"use client";

import { useActionState } from "react";
import { type ManageState, renameQuestionAction } from "@/app/actions/admin-manage";
import { buttonSecondary, inputBox, inputTone } from "@/components/ui";

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
          className={`${inputBox} ${inputTone.default} w-28 text-sm`}
        />
      </label>
      <button type="submit" disabled={pending} className={`${buttonSecondary} text-sm`}>
        {pending ? "Salvando..." : "Trocar número"}
      </button>
      <span aria-live="polite" className="w-full">
        {state.error ? (
          <span role="alert" className="text-alert">
            {state.error}
          </span>
        ) : state.saved ? (
          <span className="text-accent">Número trocado para {state.saved}.</span>
        ) : null}
      </span>
    </form>
  );
}
