import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { AuthCard } from "@/components/auth-card";
import { GoogleButton } from "@/components/google-button";
import { LoginForm } from "@/components/login-form";
import { studentPasswordEnabled } from "@/lib/auth-mode";
import { safeRedirectPath } from "@/lib/auth-validation";
import { getCurrentUser } from "@/lib/dal";
import { allowedSignupDomains, describeDomains } from "@/lib/institutional-email";

export const metadata: Metadata = { title: "Entrar — TSCQuestões" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { callbackUrl, erro, error } = await props.searchParams;
  const googleFailed = erro === "google" || typeof error === "string";
  const domains = allowedSignupDomains();
  const target = safeRedirectPath(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);

  if (await getCurrentUser()) {
    redirect(target);
  }

  return (
    <AuthCard title="Entrar" subtitle="Continue seus estudos para o ENADE.">
      {googleFailed ? (
        <p role="alert" className="mb-5 text-sm text-red-700 dark:text-red-400">
          Não foi possível entrar com essa conta Google.
          {domains.length > 0 ? ` Use sua conta institucional (${describeDomains(domains)}).` : ""}
        </p>
      ) : null}
      {googleEnabled ? (
        <div className="mb-5">
          <GoogleButton callbackUrl={target} label="Continuar com Google" />
        </div>
      ) : null}
      {studentPasswordEnabled() ? (
        <LoginForm callbackUrl={target} />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {domains.length > 0
            ? `Entre com sua conta institucional (${describeDomains(domains)}). Na primeira vez, a conta é criada automaticamente.`
            : "Na primeira vez, a conta é criada automaticamente."}
        </p>
      )}
    </AuthCard>
  );
}
