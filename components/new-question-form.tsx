"use client";

import { useActionState } from "react";
import { createQuestionAction, type ManageState } from "@/app/actions/admin-manage";

const FIELD =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function NewQuestionForm({ examId }: { examId: string }) {
  const [state, action, pending] = useActionState<ManageState, FormData>(createQuestionAction, {});
  return (
    <details className="group rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <summary className="tap cursor-pointer list-none text-sm font-medium">
        <span className="text-accent">+ Nova questão</span>
      </summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="examId" value={examId} />
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Tipo
          <select name="tipo" defaultValue="OBJECTIVE" className={FIELD}>
            <option value="OBJECTIVE">Objetiva</option>
            <option value="DISCURSIVE">Discursiva</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Número
          <input name="numero" required placeholder="36 ou D6" className={`${FIELD} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Área
          <select name="area" defaultValue="COMPONENTE_ESPECIFICO" className={FIELD}>
            <option value="COMPONENTE_ESPECIFICO">Componente Específico</option>
            <option value="FORMACAO_GERAL">Formação Geral</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar como rascunho"}
        </button>
        {state.error ? (
          <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
            {state.error}
          </p>
        ) : null}
      </form>
    </details>
  );
}
