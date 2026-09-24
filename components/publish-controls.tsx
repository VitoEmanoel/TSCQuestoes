"use client";

import { useActionState } from "react";
import { type PublishState, setPublishedAction } from "@/app/actions/admin-publish";
import { buttonDanger, buttonSmall, panel } from "@/components/ui";

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
    <section aria-label="Publicação" className={`${panel} flex flex-col gap-2`}>
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
            <button type="submit" disabled={pending} className={buttonDanger}>
              {pending ? "Salvando..." : "Voltar para rascunho"}
            </button>
          </>
        ) : (
          <>
            <input type="hidden" name="acao" value="publicar" />
            <span className="text-sm">
              <strong>Rascunho:</strong> só o administrador vê esta questão.
            </span>
            <button type="submit" disabled={pending || problems.length > 0} className={buttonSmall}>
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
          <p role="alert" className="text-alert">
            {state.error}
          </p>
        ) : null}
        {state.done === "publicada" ? (
          <p className="text-accent font-medium">Questão publicada.</p>
        ) : state.done === "rascunho" ? (
          <p className="font-medium">Questão voltou para rascunho.</p>
        ) : null}
      </div>
      {shownProblems.length > 0 ? (
        <div className="text-sm">
          <p className="text-alert font-medium">Para publicar, corrija antes:</p>
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
