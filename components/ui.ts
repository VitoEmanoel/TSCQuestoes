export const buttonPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 font-medium text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export const buttonSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-5 font-medium text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900";

export const inputBox =
  "min-h-11 rounded-lg border px-3 text-base outline-none transition-colors focus:ring-4";

export const inputBase = `${inputBox} w-full`;

export const inputTone = {
  default:
    "border-zinc-300 bg-white text-zinc-900 focus:border-accent focus:ring-accent/15 aria-invalid:border-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100",
  inverse:
    "border-zinc-700 bg-zinc-800 text-zinc-50 focus:border-zinc-300 focus:ring-zinc-300/20 aria-invalid:border-red-400",
} as const;

export const buttonSmall =
  "inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

export const buttonSmallSecondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900";

export const buttonDanger =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-alert/50 px-3 text-sm font-medium text-alert transition-colors hover:bg-alert/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alert disabled:opacity-60";

export const noticeSuccess =
  "rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

export const noticeError =
  "rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100";

export const textError = "text-sm text-alert";

export const textSuccess = "text-sm font-medium text-accent";

export const pill = {
  accent: "rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent",
  neutral:
    "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  alert: "rounded-full bg-alert/15 px-2 py-0.5 text-xs font-medium text-alert",
  outline:
    "rounded-full border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-400",
} as const;

export const backLink =
  "tap self-start text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100";

export const panel = "rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";

export const dangerPanel = "flex flex-col gap-2 rounded-xl border border-alert/30 p-4";
