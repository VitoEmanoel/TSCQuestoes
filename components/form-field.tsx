type FormFieldProps = {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
};

export function FormField({
  id,
  label,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
}: FormFieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/20 aria-invalid:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
