import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { backLink, buttonSecondary, inputBase, inputTone, pill } from "@/components/ui";
import { adminUsers, normalizeUserSearch, USER_SEARCH_MAX } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/dal";
import { displayName } from "@/lib/person-name";

export const metadata: Metadata = { title: "Contas — Painel" };

const TIME_ZONE = "America/Sao_Paulo";

function formatDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
}

function relative(date: Date | null): string {
  if (!date) {
    return "nunca usou";
  }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
  const day = date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
  const days = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  if (days <= 0) {
    return "usou hoje";
  }
  if (days === 1) {
    return "usou ontem";
  }
  return days < 30 ? `usou há ${days} dias` : `usou em ${formatDate(date)}`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default async function AdminUsersPage(props: PageProps<"/admin/usuarios">) {
  await requireAdmin();
  const { q } = await props.searchParams;
  const search = normalizeUserSearch(Array.isArray(q) ? q[0] : q);
  const { rows, summary } = await adminUsers(search);

  const stats = [
    { label: "alunos cadastrados", value: summary.students },
    { label: `novos nos últimos ${summary.recentDays} dias`, value: summary.newRecently },
    { label: `usaram nos últimos ${summary.recentDays} dias`, value: summary.activeRecently },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <Link href="/admin" className={backLink}>
        ← Voltar ao painel
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Contas</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Quem tem conta no site e quanto usou. As respostas de cada aluno não aparecem aqui.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800"
          >
            <dt className="text-sm text-zinc-600 dark:text-zinc-400">{stat.label}</dt>
            <dd className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <Form action="/admin/usuarios" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
          Buscar por nome ou e-mail
          <input
            type="search"
            name="q"
            defaultValue={search}
            maxLength={USER_SEARCH_MAX}
            className={`${inputBase} ${inputTone.default}`}
          />
        </label>
        <button type="submit" className={buttonSecondary}>
          Buscar
        </button>
      </Form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {search
          ? `${plural(rows.length, "conta encontrada", "contas encontradas")} para “${search}”. `
          : `${plural(rows.length, "conta", "contas")}, das mais novas para as mais antigas.`}
        {search ? (
          <Link
            href="/admin/usuarios"
            className="tap text-accent underline-offset-4 hover:underline"
          >
            Limpar busca
          </Link>
        ) : null}
      </p>

      {rows.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">Nenhuma conta encontrada.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map((user) => (
            <li
              key={user.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {displayName(user.name) ?? "Sem nome"}
                  </span>
                  {user.role === "ADMIN" ? <span className={pill.accent}>Admin</span> : null}
                  <span className={pill.outline}>
                    {user.signIn === "google" ? "Google" : "Senha"}
                  </span>
                </span>
                <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {user.email}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 sm:justify-end sm:text-right dark:text-zinc-400">
                <span>desde {formatDate(user.createdAt)}</span>
                <span>{plural(user.answered, "questão", "questões")}</span>
                <span>{plural(user.simulados, "simulado", "simulados")}</span>
                <span
                  className={user.lastActivity ? "text-zinc-900 dark:text-zinc-100" : undefined}
                >
                  {relative(user.lastActivity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
