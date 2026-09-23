"use client";

import { useActionState } from "react";
import { type PublishState, setPublishedAction } from "@/app/actions/admin-publish";

export function PublishControls({
  questionId,
  published,
  problems,
  openAttempts,
}: {
  questionId: string;
  published: boolean;
  problems: string[];
  openAttempts: number;
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(setPublishedAction, {});
  const shownProblems = state.problems ?? (published ? [] : problems);

  return (
    <section
      aria-label="Publicação"
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="questionId" value={questionId} />
        {published ? (
          <>
            <input type="hidden" name="acao" value="despublicar" />
            <span className="text-sm">
              <strong>Publicada:</strong> os alunos veem esta questão.
            </span>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="confirmacao" value="sim" required />
              Tirar dos alunos (voltar para rascunho)
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
            >
              {pending ? "Salvando..." : "Voltar para rascunho"}
            </button>
          </>
        ) : (
          <>
            <input type="hidden" name="acao" value="publicar" />
            <span className="text-sm">
              <strong>Rascunho:</strong> só o administrador vê esta questão.
            </span>
            <button
              type="submit"
              disabled={pending || problems.length > 0}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? "Publicando..." : "Publicar para os alunos"}
            </button>
          </>
        )}
      </form>
      {published && openAttempts > 0 ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {openAttempts}{" "}
          {openAttempts === 1 ? "simulado em andamento inclui" : "simulados em andamento incluem"}{" "}
          esta questão; quem já começou continua vendo até entregar.
        </p>
      ) : null}
      <div aria-live="polite" className="text-sm">
        {state.error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {state.error}
          </p>
        ) : null}
        {state.done === "publicada" ? (
          <p className="text-emerald-700 dark:text-emerald-400">Questão publicada.</p>
        ) : state.done === "rascunho" ? (
          <p className="text-amber-700 dark:text-amber-400">Questão voltou para rascunho.</p>
        ) : null}
      </div>
      {shownProblems.length > 0 ? (
        <div className="text-sm text-amber-900 dark:text-amber-200">
          <p className="font-medium">Para publicar, corrija antes:</p>
          <ul className="list-inside list-disc">
            {shownProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
