import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "@/components/nav-links";
import { getCurrentUser } from "@/lib/dal";

const STUDENT_LINKS = [
  { href: "/questoes", label: "Questões" },
  { href: "/simulados", label: "Simulados" },
  { href: "/historico", label: "Histórico" },
];

const ADMIN_LINKS = [...STUDENT_LINKS, { href: "/admin", label: "Painel" }];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? user?.email;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 px-4 sm:flex-nowrap">
        <Link
          href="/"
          className="flex min-h-14 items-center font-serif text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          TSCQuestões
        </Link>
        {user ? <NavLinks links={user.role === "ADMIN" ? ADMIN_LINKS : STUDENT_LINKS} /> : null}
        <div className="ml-auto flex min-h-14 items-center gap-4 text-sm">
          {user ? (
            <>
              <span className="hidden text-zinc-600 md:inline dark:text-zinc-400">{firstName}</span>
              {user.role === "ADMIN" ? (
                <span className="rounded-md border border-zinc-300 px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-zinc-600 uppercase dark:border-zinc-700 dark:text-zinc-400">
                  Admin
                </span>
              ) : null}
              <form action={logout}>
                <button
                  type="submit"
                  className="tap text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Sair
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="tap text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
              >
                Entrar
              </Link>
              <Link
                href="/cadastro"
                className="bg-accent text-accent-contrast hover:bg-accent-hover inline-flex min-h-9 items-center rounded-lg px-3 font-medium"
              >
                Criar conta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
