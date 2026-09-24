"use client";

import Form from "next/form";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckGroup } from "@/components/check-group";

type Option = { value: string; label: string };
type Entry = { year: number; area: string; type: string; status: string; topics: string[] };
type Selection = { years: number[]; topics: string[]; area: string; type: string; status: string };

const SELECT_CLASS =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function matchesStatus(entry: Entry, status: string): boolean {
  if (status === "TODAS") {
    return true;
  }
  return entry.status === (status === "ANULADA" ? "ANULADA" : "VALID");
}

function matches(entry: Entry, selection: Selection, ignore?: "years" | "topics"): boolean {
  return (
    matchesStatus(entry, selection.status) &&
    (!selection.area || entry.area === selection.area) &&
    (!selection.type || entry.type === selection.type) &&
    (ignore === "years" || selection.years.length === 0 || selection.years.includes(entry.year)) &&
    (ignore === "topics" ||
      selection.topics.length === 0 ||
      entry.topics.some((topic) => selection.topics.includes(topic)))
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function Select({
  name,
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: Option[];
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function QuestionFiltersForm({
  initial,
  catalog,
  years,
  topics,
  areas,
  types,
  situations,
}: {
  initial: Selection;
  catalog: Entry[];
  years: number[];
  topics: string[];
  areas: Option[];
  types: Option[];
  situations: Option[];
}) {
  const [selection, setSelection] = useState<Selection>(initial);
  const [open, setOpen] = useState(initial.years.length > 0 || initial.topics.length > 0);
  const available = useMemo(
    () => catalog.filter((entry) => matches(entry, selection)).length,
    [catalog, selection],
  );
  const yearCount = (year: number) =>
    catalog.filter((entry) => entry.year === year && matches(entry, selection, "years")).length;
  const topicCount = (topic: string) =>
    catalog.filter((entry) => entry.topics.includes(topic) && matches(entry, selection, "topics"))
      .length;
  const set = (patch: Partial<Selection>) => setSelection({ ...selection, ...patch });

  return (
    <Form action="/questoes" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
        <Select
          name="area"
          label="Área"
          value={selection.area}
          options={areas}
          emptyLabel="Todas"
          onChange={(area) => set({ area })}
        />
        <Select
          name="tipo"
          label="Tipo"
          value={selection.type}
          options={types}
          emptyLabel="Todos"
          onChange={(type) => set({ type })}
        />
        <Select
          name="status"
          label="Situação"
          value={selection.status}
          options={situations}
          emptyLabel="Válidas"
          onChange={(status) => set({ status })}
        />
      </div>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className="tap cursor-pointer list-none text-sm text-zinc-600 dark:text-zinc-400">
          Anos e temas
          {selection.years.length + selection.topics.length > 0
            ? ` (${selection.years.length + selection.topics.length} ${selection.years.length + selection.topics.length === 1 ? "marcado" : "marcados"})`
            : ""}
          &nbsp;·&nbsp;
          <span className="text-accent group-open:hidden">escolher</span>
          <span className="text-accent hidden group-open:inline">fechar</span>
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <CheckGroup
            legend="Anos"
            name="ano"
            values={years}
            selected={selection.years}
            count={yearCount}
            onToggle={(year) => set({ years: toggle(selection.years, year) })}
            onClear={() => set({ years: [] })}
          />
          <CheckGroup
            legend="Temas"
            name="tema"
            values={topics}
            selected={selection.topics}
            count={topicCount}
            onToggle={(topic) => set({ topics: toggle(selection.topics, topic) })}
            onClear={() => set({ topics: [] })}
          />
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Mostrar {available} {available === 1 ? "questão" : "questões"}
        </button>
        <Link
          href="/questoes"
          className="tap py-2 text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Limpar
        </Link>
      </div>
    </Form>
  );
}
