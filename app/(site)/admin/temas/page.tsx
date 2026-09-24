import type { Metadata } from "next";
import Link from "next/link";
import { NewTopicForm, TopicRow } from "@/components/topic-admin";
import { topicsWithUsage } from "@/lib/admin-topics";
import { requireAdmin } from "@/lib/dal";
import { backLink } from "@/components/ui";

export const metadata: Metadata = { title: "Temas — Painel" };

export default async function AdminTopicsPage() {
  await requireAdmin();
  const topics = await topicsWithUsage();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <Link href="/admin" className={backLink}>
        ← Voltar ao painel
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Temas</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Os temas organizam as questões e alimentam o “Onde focar” e o desempenho dos alunos.
          Renomear atualiza todas as questões; só dá para excluir um tema que nenhuma questão usa.
        </p>
      </header>
      <NewTopicForm />
      <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {topics.map((topic) => (
          <TopicRow
            key={`${topic.id}-${topic.name}`}
            id={topic.id}
            name={topic.name}
            total={topic.total}
            published={topic.published}
            locked={topic.protected}
          />
        ))}
      </ul>
    </main>
  );
}
