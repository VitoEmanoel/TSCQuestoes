import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/dal";

const ROLE_LABEL = { ADMIN: "Administrador", STUDENT: "Estudante" } as const;

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          TSCQuestões
        </Link>
        {user ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <nav aria-label="Principal" className="flex items-center gap-3">
              <Link href="/questoes" className="font-medium underline-offset-2 hover:underline">
                Questões
              </Link>
              <Link href="/simulados" className="font-medium underline-offset-2 hover:underline">
                Simulados
              </Link>
            </nav>
            <span className="text-zinc-700 dark:text-zinc-300">{user.name ?? user.email}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {ROLE_LABEL[user.role]}
            </span>
            <form action={logout}>
              <button type="submit" className="font-medium underline">
                Sair
              </button>
            </form>
          </div>
        ) : (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="font-medium underline">
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Criar conta
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
