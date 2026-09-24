import "server-only";
import type { Prisma, QuestionArea, QuestionStatus, QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE = 20;

export const PUBLISHED = { publishedAt: { not: null } } satisfies Prisma.QuestionWhereInput;

export const AREA_LABEL: Record<QuestionArea, string> = {
  FORMACAO_GERAL: "Formação Geral",
  COMPONENTE_ESPECIFICO: "Componente Específico",
};

export const TYPE_LABEL: Record<QuestionType, string> = {
  OBJECTIVE: "Objetiva",
  DISCURSIVE: "Discursiva",
};

export const SITUATION_LABEL = {
  ANULADA: "Anuladas",
  TODAS: "Todas",
} as const;

export type Situation = keyof typeof SITUATION_LABEL;

export type QuestionFilters = {
  years: number[];
  area?: QuestionArea;
  type?: QuestionType;
  status?: Situation;
  topics: string[];
  page: number;
};

const MAX_FILTER_VALUES = 30;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function all(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))].slice(0, MAX_FILTER_VALUES);
}

function pick<T extends string>(
  value: string | undefined,
  allowed: Record<T, string>,
): T | undefined {
  return value !== undefined && Object.hasOwn(allowed, value) ? (value as T) : undefined;
}

export function parseQuestionFilters(searchParams: SearchParams): QuestionFilters {
  const page = Number(first(searchParams.pagina));
  return {
    years: all(searchParams.ano)
      .map(Number)
      .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100),
    area: pick(first(searchParams.area), AREA_LABEL),
    type: pick(first(searchParams.tipo), TYPE_LABEL),
    status: pick(first(searchParams.status), SITUATION_LABEL),
    topics: all(searchParams.tema).filter((topic) => topic.length <= 100),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

export function filtersToSearchParams(
  filters: QuestionFilters,
  overrides: Partial<QuestionFilters> = {},
): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const year of merged.years) params.append("ano", String(year));
  if (merged.area) params.set("area", merged.area);
  if (merged.type) params.set("tipo", merged.type);
  if (merged.status) params.set("status", merged.status);
  for (const topic of merged.topics) params.append("tema", topic);
  if (merged.page > 1) params.set("pagina", String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function questionTitle(label: string, type: QuestionType): string {
  if (label.startsWith("D")) {
    return `Discursiva ${label.slice(1)}`;
  }
  return type === "DISCURSIVE" ? `Questão ${label} (discursiva)` : `Questão ${label}`;
}

export function excerpt(markdown: string, length = 220): string {
  const text = markdown
    .replace(/\(ver imagem anexa:[^)]*\)/g, "[imagem]")
    .replace(/^\|?\s*-{3,}.*$/gm, " ")
    .replace(/[|*`#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

function situationWhere(status: Situation | undefined): { status?: QuestionStatus } {
  if (status === "TODAS") {
    return {};
  }
  return { status: status === "ANULADA" ? "ANULADA" : "VALID" };
}

function buildWhere(filters: QuestionFilters): Prisma.QuestionWhereInput {
  return {
    ...PUBLISHED,
    ...(filters.years.length > 0 ? { exam: { year: { in: filters.years } } } : {}),
    ...(filters.area ? { area: filters.area } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...situationWhere(filters.status),
    ...(filters.topics.length > 0
      ? { tags: { some: { topic: { name: { in: filters.topics } } } } }
      : {}),
  };
}

export async function listQuestions(filters: QuestionFilters) {
  const where = buildWhere(filters);
  const [total, hiddenAnuladas] = await Promise.all([
    prisma.question.count({ where }),
    filters.status
      ? Promise.resolve(0)
      : prisma.question.count({ where: buildWhere({ ...filters, status: "ANULADA" }) }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const items = await prisma.question.findMany({
    where,
    orderBy: [{ exam: { year: "desc" } }, { order: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      originalLabel: true,
      type: true,
      area: true,
      status: true,
      statementMd: true,
      exam: { select: { year: true } },
      tags: { select: { topic: { select: { name: true } } } },
    },
  });
  return { items, total, page, pageCount, hiddenAnuladas };
}

export async function getFilterOptions() {
  const [exams, topics] = await Promise.all([
    prisma.exam.findMany({
      where: { questions: { some: PUBLISHED } },
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    prisma.topic.findMany({
      where: { questions: { some: { question: PUBLISHED } } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { years: exams.map((exam) => exam.year), topics: topics.map((topic) => topic.name) };
}

export async function getQuestionDetail(id: string, options: { publishedOnly?: boolean } = {}) {
  const publishedOnly = options.publishedOnly ?? true;
  const question = await prisma.question.findFirst({
    where: { id, ...(publishedOnly ? PUBLISHED : {}) },
    select: {
      id: true,
      examId: true,
      originalLabel: true,
      order: true,
      type: true,
      area: true,
      status: true,
      statementMd: true,
      valuePoints: true,
      sourcePage: true,
      exam: { select: { year: true } },
      tags: { select: { topic: { select: { name: true } } } },
      assets: {
        where: { answerStandardId: null },
        orderBy: [{ position: "asc" }, { filePath: "asc" }],
        select: { filePath: true, caption: true },
      },
      options: {
        orderBy: { letter: "asc" },
        select: { letter: true, textMd: true },
      },
      answerStandards: {
        orderBy: { subItem: "asc" },
        select: {
          id: true,
          subItem: true,
          criteriaMd: true,
          maxScore: true,
          assets: {
            orderBy: [{ position: "asc" }, { filePath: "asc" }],
            select: { filePath: true, caption: true },
          },
        },
      },
    },
  });
  if (!question) {
    return null;
  }
  const [previous, next] = await Promise.all([
    prisma.question.findFirst({
      where: {
        examId: question.examId,
        type: question.type,
        status: "VALID",
        ...PUBLISHED,
        order: { lt: question.order },
      },
      orderBy: { order: "desc" },
      select: { id: true, originalLabel: true, type: true },
    }),
    prisma.question.findFirst({
      where: {
        examId: question.examId,
        type: question.type,
        status: "VALID",
        ...PUBLISHED,
        order: { gt: question.order },
      },
      orderBy: { order: "asc" },
      select: { id: true, originalLabel: true, type: true },
    }),
  ]);
  return { question, previous, next };
}

export type QuestionCatalogEntry = {
  year: number;
  area: QuestionArea;
  type: QuestionType;
  status: QuestionStatus;
  topics: string[];
};

export async function questionCatalog(): Promise<QuestionCatalogEntry[]> {
  const questions = await prisma.question.findMany({
    where: PUBLISHED,
    select: {
      area: true,
      type: true,
      status: true,
      exam: { select: { year: true } },
      tags: { select: { topic: { select: { name: true } } } },
    },
  });
  return questions.map((question) => ({
    year: question.exam.year,
    area: question.area,
    type: question.type,
    status: question.status,
    topics: question.tags.map((tag) => tag.topic.name),
  }));
}
