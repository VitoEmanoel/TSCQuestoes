"use client";

import { useActionState } from "react";
import { adminLogin } from "@/app/actions/auth";
import { FormField } from "@/components/form-field";
import type { AuthFormState } from "@/lib/auth-validation";

export function AdminLoginForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(adminLogin, {});

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="username"
        defaultValue={state.values?.email}
        tone="inverse"
      />
      <FormField
        id="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        tone="inverse"
      />
      {state.message ? (
        <p role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-zinc-50 px-5 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-50 disabled:opacity-60"
      >
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
