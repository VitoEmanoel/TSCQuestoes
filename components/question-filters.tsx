import Form from "next/form";
import Link from "next/link";
import { AREA_LABEL, type QuestionFilters, SITUATION_LABEL, TYPE_LABEL } from "@/lib/questions";

type Option = { value: string; label: string };

function FilterSelect({
  id,
  label,
  options,
  value,
  emptyLabel = "Todos",
}: {
  id: string;
  label: string;
  options: Option[];
  value?: string;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={value ?? ""}
        className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function toOptions<T extends string>(labels: Record<T, string>): Option[] {
  return (Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
}

export function QuestionFiltersForm({
  filters,
  years,
  topics,
}: {
  filters: QuestionFilters;
  years: number[];
  topics: string[];
}) {
  return (
    <Form
      action="/questoes"
      className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-3 lg:grid-cols-6 dark:border-zinc-800"
    >
      <FilterSelect
        id="ano"
        label="Ano"
        value={filters.year ? String(filters.year) : undefined}
        options={years.map((year) => ({ value: String(year), label: String(year) }))}
      />
      <FilterSelect id="area" label="Área" value={filters.area} options={toOptions(AREA_LABEL)} />
      <FilterSelect id="tipo" label="Tipo" value={filters.type} options={toOptions(TYPE_LABEL)} />
      <FilterSelect
        id="tema"
        label="Tema"
        value={filters.topic}
        options={topics.map((topic) => ({ value: topic, label: topic }))}
      />
      <FilterSelect
        id="status"
        label="Situação"
        value={filters.status}
        options={toOptions(SITUATION_LABEL)}
        emptyLabel="Válidas"
      />
      <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Filtrar
        </button>
        <Link href="/questoes" className="tap py-2 text-sm underline">
          Limpar
        </Link>
      </div>
    </Form>
  );
}
