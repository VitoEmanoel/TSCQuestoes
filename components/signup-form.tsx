"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { type AuthFormState, PASSWORD_MIN_LENGTH } from "@/lib/auth-validation";
import { FormField } from "@/components/form-field";
import { buttonPrimary } from "@/components/ui";

export function SignupForm({ emailHint }: { emailHint?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signup, {});

  if (state.sentTo) {
    return (
      <div role="status" className="flex flex-col gap-3 text-sm">
        <p className="text-base font-medium">Verifique seu e-mail</p>
        <p>
          Se o endereço <strong>{state.sentTo}</strong> puder ser usado, enviamos para ele as
          instruções para ativar a conta. O link vale por 24 horas.
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          Não recebeu? Confira a caixa de spam ou aguarde alguns minutos antes de tentar de novo.
        </p>
        <Link href="/login" className="tap text-accent font-medium underline underline-offset-4">
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormField
        id="name"
        label="Nome"
        autoComplete="name"
        defaultValue={state.values?.name}
        error={state.errors?.name}
      />
      <FormField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.errors?.email}
        hint={emailHint}
      />
      <FormField
        id="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        error={state.errors?.password}
        hint={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres, com letras e números.`}
      />
      <FormField
        id="confirmPassword"
        label="Confirme a senha"
        type="password"
        autoComplete="new-password"
        error={state.errors?.confirmPassword}
      />
      {state.message ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonPrimary} w-full`}>
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Já tem conta?{" "}
        <Link href="/login" className="text-accent font-medium underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </form>
  );
}
