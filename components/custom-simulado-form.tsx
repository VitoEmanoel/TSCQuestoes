"use client";

import { useActionState } from "react";
import { createCustomSimuladoAction, type CustomSimuladoState } from "@/app/actions/simulados";

type Option = { value: string; label: string };

const SELECT_CLASS =
  "rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Select({
  name,
  label,
  options,
  emptyLabel,
  defaultValue,
}: {
  name: string;
  label: string;
  options: Option[];
  emptyLabel?: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={SELECT_CLASS}>
        {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CustomSimuladoForm({
  years,
  topics,
  areas,
  types,
  counts,
  minutes,
}: {
  years: number[];
  topics: string[];
  areas: Option[];
  types: Option[];
  counts: number[];
  minutes: readonly number[];
}) {
  const [state, action, pending] = useActionState<CustomSimuladoState, FormData>(
    createCustomSimuladoAction,
    {},
  );

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Select
          name="ano"
          label="Ano"
          emptyLabel="Todos"
          options={years.map((year) => ({ value: String(year), label: String(year) }))}
        />
        <Select name="area" label="Área" emptyLabel="Todas" options={areas} />
        <Select name="tipo" label="Tipo" emptyLabel="Todos" options={types} />
        <Select
          name="tema"
          label="Tema"
          emptyLabel="Todos"
          options={topics.map((topic) => ({ value: topic, label: topic }))}
        />
        <Select
          name="quantidade"
          label="Quantidade"
          defaultValue="10"
          options={counts.map((count) => ({ value: String(count), label: `${count} questões` }))}
        />
        <Select
          name="tempo"
          label="Tempo"
          emptyLabel="Sem tempo"
          options={minutes.map((value) => ({
            value: String(value),
            label: value < 60 ? `${value} min` : `${value / 60} h`.replace(".5 h", " h 30 min"),
          }))}
        />
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        As questões são sorteadas entre as válidas que batem com os filtros (anuladas ficam de
        fora).
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Sorteando..." : "Montar simulado"}
      </button>
    </form>
  );
}
