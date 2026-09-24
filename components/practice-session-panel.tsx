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

  const current = POLICY_OPTIONS.find((option) => option.value === policy);

  return (
    <section aria-label="Sessão de estudo" className="flex flex-col gap-3 text-sm">
      <details className="group">
        <summary className="tap cursor-pointer list-none text-zinc-600 dark:text-zinc-400">
          Correção:&nbsp;
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {current?.label.toLowerCase()}
          </span>
          &nbsp;·&nbsp;
          <span className="text-accent underline-offset-4 group-open:hidden hover:underline">
            alterar
          </span>
          <span className="text-accent hidden group-open:inline">fechar</span>
        </summary>
        <form action={policyAction} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="sr-only">Mostrar a correção</span>
            <select
              name="policy"
              defaultValue={policy}
              key={policy}
              disabled={locked || savingPolicy}
              className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
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
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {savingPolicy ? "Salvando..." : "Salvar"}
          </button>
          {locked ? (
            <p className="w-full text-zinc-600 dark:text-zinc-400">
              Para trocar o modo, finalize a sessão primeiro.
            </p>
          ) : null}
        </form>
      </details>
      <div aria-live="polite">
        {policyState.error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {policyState.error}
          </p>
        ) : policyState.savedAt ? (
          <p className="text-accent">Modo de correção salvo.</p>
        ) : null}
      </div>

      {policy !== "IMMEDIATE" && answered > 0 ? (
        <div className="bg-accent-soft flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
          <p className="text-zinc-800 dark:text-zinc-200">
            {`${answered} ${answered === 1 ? "resposta" : "respostas"} nesta sessão, ${pending} aguardando correção.`}
          </p>
          <form action={finishAction} className="ml-auto">
            <button
              type="submit"
              disabled={finishing}
              className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-5 font-medium transition-colors disabled:opacity-60"
            >
              {finishing ? "Corrigindo..." : "Finalizar sessão e ver resultado"}
            </button>
          </form>
          {finishState.error ? (
            <p role="alert" className="w-full text-red-700 dark:text-red-400">
              {finishState.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
