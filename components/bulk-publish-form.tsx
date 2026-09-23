"use client";

import { type ReactNode, useActionState, useRef } from "react";
import { type BulkState, bulkPublishAction } from "@/app/actions/admin-publish";

export function BulkPublishForm({ examId, children }: { examId: string; children: ReactNode }) {
  const [state, action, pending] = useActionState<BulkState, FormData>(bulkPublishAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const setAll = (checked: boolean) => {
    for (const input of formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ??
      []) {
      input.checked = checked;
    }
  };

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="examId" value={examId} />
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/95 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/95">
        <button type="button" onClick={() => setAll(true)} className="underline">
          Marcar todas
        </button>
        <button type="button" onClick={() => setAll(false)} className="underline">
          Desmarcar
        </button>
        <button
          type="submit"
          name="acao"
          value="publicar"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          Publicar selecionadas
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="confirmacao" value="sim" />
          confirmo tirar dos alunos
        </label>
        <button
          type="submit"
          name="acao"
          value="despublicar"
          disabled={pending}
          className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
        >
          Voltar selecionadas para rascunho
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {state.error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {state.error}
          </p>
        ) : null}
        {state.summary ? <p className="font-medium">{state.summary}</p> : null}
        {state.skipped && state.skipped.length > 0 ? (
          <ul className="mt-1 list-inside list-disc text-amber-900 dark:text-amber-200">
            {state.skipped.map((item) => (
              <li key={item.label}>
                {item.label}: {item.problems.join(" ")}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {children}
    </form>
  );
}
