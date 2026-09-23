import type { Metadata } from "next";
import Link from "next/link";
import { QuestionFiltersForm } from "@/components/question-filters";
import { requireUser } from "@/lib/dal";
import {
  AREA_LABEL,
  excerpt,
  filtersToSearchParams,
  getFilterOptions,
  listQuestions,
  parseQuestionFilters,
  questionTitle,
  TYPE_LABEL,
} from "@/lib/questions";

export const metadata: Metadata = { title: "Questões — TSCQuestões" };

export default async function QuestionsPage(props: PageProps<"/questoes">) {
  const filters = parseQuestionFilters(await props.searchParams);
  await requireUser(`/questoes${filtersToSearchParams(filters)}`);

  const [{ items, total, page, pageCount }, { years, topics }] = await Promise.all([
    listQuestions(filters),
    getFilterOptions(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Questões</h1>
      <QuestionFiltersForm filters={filters} years={years} topics={topics} />
      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {total === 0
          ? "Nenhuma questão encontrada com esses filtros."
          : `${total} ${total === 1 ? "questão encontrada" : "questões encontradas"}`}
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((question) => (
          <li
            key={question.id}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-sm font-semibold">
                {questionTitle(question.originalLabel, question.type)}
              </span>
              <span className="text-zinc-500">ENADE {question.exam.year}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                {AREA_LABEL[question.area]}
              </span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                {TYPE_LABEL[question.type]}
              </span>
              {question.tags.map((tag) => (
                <span
                  key={tag.topic.name}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800"
                >
                  {tag.topic.name}
                </span>
              ))}
              {question.status === "ANULADA" ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  Anulada
                </span>
              ) : null}
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {excerpt(question.statementMd)}
            </p>
          </li>
        ))}
      </ul>
      {pageCount > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/questoes${filtersToSearchParams(filters, { page: page - 1 })}`}
              className="underline"
            >
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-zinc-600 dark:text-zinc-400">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/questoes${filtersToSearchParams(filters, { page: page + 1 })}`}
              className="underline"
            >
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}
