import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { ConfirmSignupForm } from "@/components/confirm-signup-form";
import { getCurrentUser } from "@/lib/dal";
import { findPendingSignup } from "@/lib/signup";

export const metadata: Metadata = { title: "Ativar conta — TSCQuestões" };

export default async function ConfirmSignupPage(props: PageProps<"/cadastro/confirmar">) {
  if (await getCurrentUser()) {
    redirect("/");
  }

  const { token } = await props.searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  const pending = value ? await findPendingSignup(value) : null;

  return (
    <AuthCard title="Ativar conta">
      {pending && value ? (
        <ConfirmSignupForm token={value} email={pending.email} />
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p>Este link é inválido ou expirou.</p>
          <Link href="/cadastro" className="tap font-medium underline">
            Fazer o cadastro novamente
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
