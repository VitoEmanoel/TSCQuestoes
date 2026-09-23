import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "@/components/signup-form";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Criar conta — TSCQuestões" };

export default async function SignupPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <AuthCard title="Criar conta">
      <SignupForm />
    </AuthCard>
  );
}
