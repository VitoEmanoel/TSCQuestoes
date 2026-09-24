"use client";

import { type ReactNode, useActionState, useRef } from "react";
import { type BulkState, bulkPublishAction } from "@/app/actions/admin-publish";
import { buttonDanger, buttonSmall, textError } from "@/components/ui";

const LINK =
  "tap text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100";

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
      <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200 py-3 text-sm backdrop-blur dark:border-zinc-800">
        <button type="button" onClick={() => setAll(true)} className={LINK}>
          Marcar todas
        </button>
        <button type="button" onClick={() => setAll(false)} className={LINK}>
          Desmarcar
        </button>
        <button
          type="submit"
          name="acao"
          value="publicar"
          disabled={pending}
          className={buttonSmall}
        >
          Publicar selecionadas
        </button>
        <label className="ml-auto flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" name="confirmacao" value="sim" />
          confirmo tirar dos alunos
        </label>
        <button
          type="submit"
          name="acao"
          value="despublicar"
          disabled={pending}
          className={buttonDanger}
        >
          Voltar selecionadas para rascunho
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {state.error ? (
          <p role="alert" className={textError}>
            {state.error}
          </p>
        ) : null}
        {state.summary ? <p className="font-medium">{state.summary}</p> : null}
        {state.skipped && state.skipped.length > 0 ? (
          <ul className="text-alert mt-1 list-inside list-disc">
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
