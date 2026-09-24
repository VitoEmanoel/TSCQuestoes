import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { googleEnabled } from "@/auth";
import { AuthCard } from "@/components/auth-card";
import { GoogleButton } from "@/components/google-button";
import { SignupForm } from "@/components/signup-form";
import { studentPasswordEnabled } from "@/lib/auth-mode";
import { getCurrentUser } from "@/lib/dal";
import { allowedSignupDomains, describeDomains } from "@/lib/institutional-email";

export const metadata: Metadata = { title: "Criar conta — TSCQuestões" };

export default async function SignupPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <AuthCard title="Criar conta" subtitle="Conta de estudante, de graça. Leva um minuto.">
      {googleEnabled ? (
        <div className="mb-5">
          <GoogleButton callbackUrl="/" label="Criar conta com Google" />
        </div>
      ) : null}
      {studentPasswordEnabled() ? (
        <SignupForm
          emailHint={
            allowedSignupDomains().length > 0
              ? `Use seu e-mail institucional (${describeDomains(allowedSignupDomains())}).`
              : undefined
          }
        />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {allowedSignupDomains().length > 0
            ? `Use sua conta institucional (${describeDomains(allowedSignupDomains())}). Não precisa criar senha.`
            : "Não precisa criar senha."}
        </p>
      )}
    </AuthCard>
  );
}
