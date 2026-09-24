import type { Metadata } from "next";
import Link from "next/link";
import { ExamBadge } from "@/components/exam-badge";
import { PracticeSessionPanel } from "@/components/practice-session-panel";
import { QuestionFiltersForm } from "@/components/question-filters";
import { requireUser } from "@/lib/dal";
import { practiceSession } from "@/lib/practice";
import {
  AREA_LABEL,
  excerpt,
  filtersToSearchParams,
  getFilterOptions,
  listQuestions,
  parseQuestionFilters,
  questionCatalog,
  SITUATION_LABEL,
  questionTitle,
  TYPE_LABEL,
} from "@/lib/questions";

export const metadata: Metadata = { title: "Questões — TSCQuestões" };

export default async function QuestionsPage(props: PageProps<"/questoes">) {
  const filters = parseQuestionFilters(await props.searchParams);
  const user = await requireUser(`/questoes${filtersToSearchParams(filters)}`);

  const [{ items, total, page, pageCount, hiddenAnuladas }, { years, topics }, session, catalog] =
    await Promise.all([
      listQuestions(filters),
      getFilterOptions(),
      practiceSession(user.id),
      questionCatalog(),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">Questões</h1>
      <PracticeSessionPanel
        policy={session.policy}
        answered={session.answered}
        pending={session.pending}
      />
      <QuestionFiltersForm
        key={filtersToSearchParams(filters, { page: 1 })}
        initial={{
          years: filters.years,
          topics: filters.topics,
          area: filters.area ?? "",
          type: filters.type ?? "",
          status: filters.status ?? "",
        }}
        catalog={catalog}
        years={years}
        topics={topics}
        areas={Object.entries(AREA_LABEL).map(([value, label]) => ({ value, label }))}
        types={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        situations={Object.entries(SITUATION_LABEL).map(([value, label]) => ({ value, label }))}
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {total === 0
          ? "Nenhuma questão encontrada com esses filtros."
          : `${total} ${total === 1 ? "questão encontrada" : "questões encontradas"}`}
        {hiddenAnuladas > 0 ? (
          <>
            {" "}
            · {hiddenAnuladas}{" "}
            {hiddenAnuladas === 1 ? "anulada pelo INEP oculta" : "anuladas pelo INEP ocultas"} (
            <Link
              href={`/questoes${filtersToSearchParams(filters, { status: "ANULADA", page: 1 })}`}
              className="text-accent underline underline-offset-4"
            >
              ver
            </Link>
            )
          </>
        ) : null}
      </p>
      <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((question) => {
          const topics = question.tags
            .map((tag) => tag.topic.name)
            .filter((name) => name !== AREA_LABEL[question.area]);
          return (
            <li key={question.id}>
              <Link
                href={`/questoes/${question.id}`}
                className="group flex flex-col gap-1.5 py-4 sm:py-5"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                  <ExamBadge year={question.exam.year} />
                  <span>{AREA_LABEL[question.area]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{TYPE_LABEL[question.type]}</span>
                  {topics.length > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{topics.join(", ")}</span>
                    </>
                  ) : null}
                  {question.status === "ANULADA" ? (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                      Anulada
                    </span>
                  ) : null}
                </span>
                <span className="group-hover:text-accent font-medium text-zinc-900 dark:text-zinc-100">
                  {questionTitle(question.originalLabel, question.type)}
                </span>
                <span className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {excerpt(question.statementMd)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {pageCount > 1 ? (
        <nav aria-label="Paginação" className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/questoes${filtersToSearchParams(filters, { page: page - 1 })}`}
              className="tap underline"
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
              className="tap underline"
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
