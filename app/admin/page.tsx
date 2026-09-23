import type { Metadata } from "next";
import Link from "next/link";
import { ExamBadge } from "@/components/exam-badge";
import { adminExams } from "@/lib/admin-questions";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "Painel — TSCQuestões" };

export default async function AdminPage(props: PageProps<"/admin">) {
  await requireAdmin();
  const { excluida } = await props.searchParams;
  const exams = await adminExams();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Painel do administrador</h1>
        <p className="text-zinc-700 dark:text-zinc-300">
          Escolha uma prova para revisar e editar as questões. O que você salvar aqui é a versão
          oficial que os alunos veem.
        </p>
        <Link
          href="/admin/provas/nova"
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Cadastrar prova nova
        </Link>
        {excluida === "1" ? (
          <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Prova excluída.
          </p>
        ) : null}
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {exams.map((exam) => (
          <li key={exam.id}>
            <Link
              href={`/admin/provas/${exam.id}`}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <span className="flex items-center gap-2">
                <ExamBadge year={exam.year} />
                <span className="font-semibold">Prova de {exam.year}</span>
              </span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {exam.total} questões · {exam.published} publicadas
                {exam.total - exam.published > 0
                  ? ` · ${exam.total - exam.published} em rascunho`
                  : ""}
                {exam.anuladas > 0 ? ` · ${exam.anuladas} anuladas` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
