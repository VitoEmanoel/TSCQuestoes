import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { AdminAuthShell } from "@/components/auth-card";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "Área administrativa — TSCQuestões",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user?.role === "ADMIN") {
    redirect("/admin");
  }
  return (
    <AdminAuthShell>
      <AdminLoginForm />
    </AdminAuthShell>
  );
}
