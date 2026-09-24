import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/signup-form";
import { getCurrentUser } from "@/lib/dal";
import { allowedSignupDomains, describeDomains } from "@/lib/institutional-email";

export const metadata: Metadata = { title: "Criar conta — TSCQuestões" };

export default async function SignupPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <AuthCard title="Criar conta" subtitle="Conta de estudante, de graça. Leva um minuto.">
      <SignupForm
        emailHint={
          allowedSignupDomains().length > 0
            ? `Use seu e-mail institucional (${describeDomains(allowedSignupDomains())}).`
            : undefined
        }
      />
    </AuthCard>
  );
}
