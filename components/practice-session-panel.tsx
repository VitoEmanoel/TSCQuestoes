"use client";

import { useActionState } from "react";
import {
  finishSessionAction,
  type PracticeSessionState,
  setRevealPolicyAction,
} from "@/app/actions/practice";

type Policy = "IMMEDIATE" | "AT_END" | "MANUAL";

const POLICY_OPTIONS: { value: Policy; label: string; help: string }[] = [
  { value: "IMMEDIATE", label: "Na hora", help: "vê se acertou logo depois de responder" },
  {
    value: "AT_END",
    label: "Ao finalizar a sessão",
    help: "responde várias e vê tudo junto no final",
  },
  { value: "MANUAL", label: "Quando eu pedir", help: "cada resposta tem um botão “Ver correção”" },
];

export function PracticeSessionPanel({
  policy,
  answered,
  pending,
}: {
  policy: Policy;
  answered: number;
  pending: number;
}) {
  const [policyState, policyAction, savingPolicy] = useActionState<PracticeSessionState, FormData>(
    setRevealPolicyAction,
    {},
  );
  const [finishState, finishAction, finishing] = useActionState<PracticeSessionState, FormData>(
    finishSessionAction,
    {},
  );
  const locked = pending > 0;

  return (
    <section
      aria-label="Sessão de estudo"
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <form action={policyAction} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Mostrar a correção</span>
          <select
            name="policy"
            defaultValue={policy}
            key={policy}
            disabled={locked || savingPolicy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {POLICY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.help}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={locked || savingPolicy}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          {savingPolicy ? "Salvando..." : "Salvar"}
        </button>
      </form>
      <div aria-live="polite" className="text-sm">
        {policyState.error ? (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {policyState.error}
          </p>
        ) : policyState.savedAt ? (
          <p className="text-emerald-700 dark:text-emerald-400">Modo de correção salvo.</p>
        ) : null}
      </div>

      {policy !== "IMMEDIATE" ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
          <p className="text-zinc-700 dark:text-zinc-300">
            {answered === 0
              ? "Nenhuma resposta nesta sessão ainda."
              : `${answered} ${answered === 1 ? "resposta" : "respostas"} nesta sessão, ${pending} aguardando correção.`}
            {locked ? " Para trocar o modo, finalize a sessão." : null}
          </p>
          {answered > 0 ? (
            <form action={finishAction}>
              <button
                type="submit"
                disabled={finishing}
                className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {finishing ? "Corrigindo..." : "Finalizar sessão e ver resultado"}
              </button>
            </form>
          ) : null}
          {finishState.error ? (
            <p role="alert" className="text-red-600 dark:text-red-400">
              {finishState.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
