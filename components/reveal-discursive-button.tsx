"use client";

import { useActionState } from "react";
import { revealDiscursiveAction, type RevealDiscursiveState } from "@/app/actions/practice";

export function RevealDiscursiveButton({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState<RevealDiscursiveState, FormData>(
    revealDiscursiveAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-11 items-center justify-center self-start rounded-lg px-5 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {pending ? "Abrindo..." : "Ver padrão de resposta"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
