"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { FormField } from "@/components/form-field";
import { buttonPrimary } from "@/components/ui";
import type { AuthFormState } from "@/lib/auth-validation";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
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
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? "Entrando..." : "Entrar"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="text-accent font-medium underline underline-offset-4">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
