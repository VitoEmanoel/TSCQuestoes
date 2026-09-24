"use client";

import { useActionState } from "react";
import {
  createTopicAction,
  deleteTopicAction,
  renameTopicAction,
  type TopicState,
} from "@/app/actions/admin-topics";

const FIELD =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900";

function Feedback({ state }: { state: TopicState }) {
  return (
    <span aria-live="polite" className="w-full text-sm">
      {state.error ? (
        <span role="alert" className="text-red-700 dark:text-red-400">
          {state.error}
        </span>
      ) : state.saved ? (
        <span className="text-accent">{state.saved}</span>
      ) : null}
    </span>
  );
}

export function NewTopicForm() {
  const [state, action, pending] = useActionState<TopicState, FormData>(createTopicAction, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Novo tema
        <input
          name="nome"
          required
          maxLength={60}
          placeholder="Ex.: Segurança da Informação"
          className={`${FIELD} w-72`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Categoria
        <select name="categoria" defaultValue="Componente Específico" className={FIELD}>
          <option>Componente Específico</option>
          <option>Formação Geral</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "Criando..." : "Criar tema"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function TopicRow({
  id,
  name,
  total,
  published,
  locked,
}: {
  id: string;
  name: string;
  total: number;
  published: number;
  locked: boolean;
}) {
  const [renameState, renameAction, renaming] = useActionState<TopicState, FormData>(
    renameTopicAction,
    {},
  );
  const [deleteState, deleteAction, deleting] = useActionState<TopicState, FormData>(
    deleteTopicAction,
    {},
  );
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{name}</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} {total === 1 ? "questão" : "questões"} ({published}{" "}
          {published === 1 ? "publicada" : "publicadas"})
        </span>
      </div>
      {locked ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Usado automaticamente pelo sistema nas questões de Formação Geral — não pode ser renomeado
          nem excluído.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <form action={renameAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="topicId" value={id} />
            <label className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="sr-only">Novo nome de {name}</span>
              <input
                name="nome"
                defaultValue={name}
                required
                maxLength={60}
                className={`${FIELD} w-64`}
              />
            </label>
            <button type="submit" disabled={renaming} className={SECONDARY}>
              {renaming ? "Salvando..." : "Renomear"}
            </button>
          </form>
          {total === 0 ? (
            <form action={deleteAction}>
              <input type="hidden" name="topicId" value={id} />
              <button
                type="submit"
                disabled={deleting}
                className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-4 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
              >
                Excluir
              </button>
            </form>
          ) : null}
          <Feedback state={renameState.error || renameState.saved ? renameState : deleteState} />
        </div>
      )}
    </li>
  );
}
