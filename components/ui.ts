export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 font-medium text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900";

export const inputBase =
  "min-h-11 w-full rounded-lg border px-3 text-base outline-none transition-colors focus:ring-4";

export const inputTone = {
  default:
    "border-zinc-300 bg-white text-zinc-900 focus:border-accent focus:ring-accent/15 aria-invalid:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  inverse:
    "border-zinc-700 bg-zinc-800 text-zinc-50 focus:border-zinc-300 focus:ring-zinc-300/20 aria-invalid:border-red-400",
} as const;
