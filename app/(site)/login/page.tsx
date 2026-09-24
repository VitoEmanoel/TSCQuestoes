import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "@/components/login-form";
import { safeRedirectPath } from "@/lib/auth-validation";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = { title: "Entrar — TSCQuestões" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { callbackUrl } = await props.searchParams;
  const target = safeRedirectPath(Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl);

  if (await getCurrentUser()) {
    redirect(target);
  }

  return (
    <AuthCard title="Entrar" subtitle="Continue seus estudos para o ENADE.">
      <LoginForm callbackUrl={target} />
    </AuthCard>
  );
}
