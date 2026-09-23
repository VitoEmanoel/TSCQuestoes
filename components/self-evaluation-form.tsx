"use client";

import { useActionState, useState } from "react";
import { selfEvaluateAction, type SelfEvaluationState } from "@/app/actions/practice";

type Slot = { key: string; label: string; max: number };

function formatScore(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function SelfEvaluationForm({
  itemId,
  slots,
  initial,
}: {
  itemId: string;
  slots: Slot[];
  initial: Record<string, number> | null;
}) {
  const [state, action, pending] = useActionState<SelfEvaluationState, FormData>(
    selfEvaluateAction,
    {},
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      slots.map((slot) => [
        slot.key,
        initial?.[slot.key] !== undefined ? String(initial[slot.key]) : "",
      ]),
    ),
  );
  const maxTotal = slots.reduce((sum, slot) => sum + slot.max, 0);
  const total = slots.reduce((sum, slot) => {
    const value = Number((values[slot.key] ?? "").replace(",", "."));
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="itemId" value={itemId} />
      <div className="flex flex-wrap gap-4">
        {slots.map((slot) => (
          <label key={slot.key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {slot.label}{" "}
              <span className="font-normal text-zinc-500">(0 a {formatScore(slot.max)})</span>
            </span>
            <input
              type="number"
              name={`score_${slot.key}`}
              min={0}
              max={slot.max}
              step={0.5}
              required
              inputMode="decimal"
              value={values[slot.key]}
              onChange={(event) => setValues({ ...values, [slot.key]: event.target.value })}
              className="w-28 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
        ))}
      </div>
      <p className="text-sm">
        Total: <strong>{formatScore(total)}</strong> de {formatScore(maxTotal)}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.savedAt && !state.error ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Autoavaliação salva: {formatScore(state.savedTotal ?? 0)} de {formatScore(maxTotal)}.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Salvando..." : "Salvar autoavaliação"}
      </button>
    </form>
  );
}
