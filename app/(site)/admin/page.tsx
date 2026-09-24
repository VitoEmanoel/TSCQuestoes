import type { Metadata } from "next";
import Link from "next/link";
import { ExamBadge } from "@/components/exam-badge";
import { adminExams } from "@/lib/admin-questions";
import { requireAdmin } from "@/lib/dal";
import { buttonPrimary, buttonSecondary, textSuccess } from "@/components/ui";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export const metadata: Metadata = { title: "Painel — TSCQuestões" };

export default async function AdminPage(props: PageProps<"/admin">) {
  await requireAdmin();
  const { excluida } = await props.searchParams;
  const exams = await adminExams();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Painel</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            O que você salvar aqui é a versão oficial que os alunos veem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/provas/nova" className={`${buttonPrimary} text-sm`}>
            Cadastrar prova nova
          </Link>
          <Link href="/admin/temas" className={`${buttonSecondary} text-sm`}>
            Gerenciar temas
          </Link>
        </div>
        {excluida === "1" ? (
          <p role="status" className={textSuccess}>
            Prova excluída.
          </p>
        ) : null}
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {exams.map((exam) => (
          <li key={exam.id}>
            <Link
              href={`/admin/provas/${exam.id}`}
              className="flex h-full flex-col gap-2 rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <span className="flex items-center gap-2">
                <ExamBadge year={exam.year} />
                <span className="font-semibold">Prova de {exam.year}</span>
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {[
                  plural(exam.total, "questão", "questões"),
                  plural(exam.published, "publicada", "publicadas"),
                  exam.total - exam.published > 0
                    ? `${exam.total - exam.published} em rascunho`
                    : null,
                  exam.anuladas > 0 ? plural(exam.anuladas, "anulada", "anuladas") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {exam.unreviewed > 0 ? (
                <span className="text-alert text-sm">
                  {plural(exam.unreviewed, "não revisada", "não revisadas")}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
