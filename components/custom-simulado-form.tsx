"use client";

import { useActionState, useMemo, useState } from "react";
import { createCustomSimuladoAction, type CustomSimuladoState } from "@/app/actions/simulados";

type Option = { value: string; label: string };
type Entry = { year: number; area: string; type: string; topics: string[] };

type Filters = { years: number[]; topics: string[]; area: string; type: string };

const SELECT_CLASS =
  "rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function matches(entry: Entry, filters: Filters, ignore?: "years" | "topics"): boolean {
  if (ignore !== "years" && filters.years.length > 0 && !filters.years.includes(entry.year)) {
    return false;
  }
  if (
    ignore !== "topics" &&
    filters.topics.length > 0 &&
    !entry.topics.some((topic) => filters.topics.includes(topic))
  ) {
    return false;
  }
  if (filters.area && entry.area !== filters.area) {
    return false;
  }
  return !(filters.type && entry.type !== filters.type);
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function minutesLabel(value: number): string {
  if (value < 60) {
    return `${value} min`;
  }
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function CheckGroup<T extends string | number>({
  legend,
  name,
  values,
  selected,
  count,
  onToggle,
  onClear,
}: {
  legend: string;
  name: string;
  values: T[];
  selected: T[];
  count: (value: T) => number;
  onToggle: (value: T) => void;
  onClear: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-medium">
        <span>
          {legend}{" "}
          <span className="font-normal text-zinc-500">
            {selected.length === 0 ? "(nenhum marcado = todos)" : `(${selected.length} marcados)`}
          </span>
        </span>
        {selected.length > 0 ? (
          <button type="button" onClick={onClear} className="tap text-xs font-normal underline">
            Limpar
          </button>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => {
          const available = count(value);
          const checked = selected.includes(value);
          return (
            <label
              key={value}
              className={`has-[:focus-visible]:outline-accent flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                checked
                  ? "border-accent bg-accent text-accent-contrast"
                  : available === 0
                    ? "border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                    : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700"
              }`}
            >
              <input
                type="checkbox"
                name={name}
                value={value}
                checked={checked}
                onChange={() => onToggle(value)}
                className="sr-only"
              />
              <span>{value}</span>
              <span className={checked ? "opacity-80" : "text-zinc-500"}>({available})</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CustomSimuladoForm({
  catalog,
  years,
  topics,
  areas,
  types,
  counts,
  minutes,
}: {
  catalog: Entry[];
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
  const [filters, setFilters] = useState<Filters>({ years: [], topics: [], area: "", type: "" });
  const [quantity, setQuantity] = useState(10);

  const available = useMemo(
    () => catalog.filter((entry) => matches(entry, filters)).length,
    [catalog, filters],
  );
  const yearCount = (year: number) =>
    catalog.filter((entry) => entry.year === year && matches(entry, filters, "years")).length;
  const topicCount = (topic: string) =>
    catalog.filter((entry) => entry.topics.includes(topic) && matches(entry, filters, "topics"))
      .length;

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <CheckGroup
        legend="Anos"
        name="ano"
        values={years}
        selected={filters.years}
        count={yearCount}
        onToggle={(year) => setFilters({ ...filters, years: toggle(filters.years, year) })}
        onClear={() => setFilters({ ...filters, years: [] })}
      />
      <CheckGroup
        legend="Temas"
        name="tema"
        values={topics}
        selected={filters.topics}
        count={topicCount}
        onToggle={(topic) => setFilters({ ...filters, topics: toggle(filters.topics, topic) })}
        onClear={() => setFilters({ ...filters, topics: [] })}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Área</span>
          <select
            name="area"
            value={filters.area}
            onChange={(event) => setFilters({ ...filters, area: event.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">Todas</option>
            {areas.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            name="tipo"
            value={filters.type}
            onChange={(event) => setFilters({ ...filters, type: event.target.value })}
            className={SELECT_CLASS}
          >
            <option value="">Todos</option>
            {types.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Quantidade</span>
          <select
            name="quantidade"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className={SELECT_CLASS}
          >
            {counts.map((count) => (
              <option key={count} value={count}>
                {count} questões
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tempo</span>
          <select name="tempo" defaultValue="" className={SELECT_CLASS}>
            <option value="">Sem tempo</option>
            {minutes.map((value) => (
              <option key={value} value={value}>
                {minutesLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p aria-live="polite" className="text-sm">
        <span className="font-semibold">
          {available} {available === 1 ? "questão disponível" : "questões disponíveis"}
        </span>{" "}
        com esses filtros (anuladas ficam de fora).
        {available > 0 && quantity > available
          ? ` Você pediu ${quantity}: o simulado vai usar as ${available}.`
          : null}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || available === 0}
        className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center self-start rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "Sorteando..." : "Montar simulado"}
      </button>
    </form>
  );
}
