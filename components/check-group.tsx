"use client";

export function CheckGroup<T extends string | number>({
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
            {selected.length === 0
              ? "(nenhum marcado = todos)"
              : `(${selected.length} ${selected.length === 1 ? "marcado" : "marcados"})`}
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
