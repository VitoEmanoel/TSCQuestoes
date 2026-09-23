"use client";

import { useActionState } from "react";
import { confirmSignup } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/auth-validation";
import { FormField } from "@/components/form-field";

export function ConfirmSignupForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(confirmSignup, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Para ativar a conta de <strong>{email}</strong>, digite a senha que você escolheu no
        cadastro.
      </p>
      <input type="hidden" name="token" value={token} />
      <FormField id="password" label="Senha" type="password" autoComplete="current-password" />
      {state.message ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {pending ? "Ativando..." : "Ativar conta"}
      </button>
    </form>
  );
}
