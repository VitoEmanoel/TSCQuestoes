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
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
