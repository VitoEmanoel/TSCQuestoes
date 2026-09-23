"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import type { AuthFormState } from "@/lib/auth-validation";
import { FormField } from "@/components/form-field";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <FormField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
      />
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
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium underline">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
