import "server-only";
import type { QuestionArea, QuestionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseRichText } from "@/lib/rich-text";

export const LIMITS = {
  statement: 20_000,
  option: 5_000,
  criteria: 20_000,
  standards: 10,
  topics: 10,
  points: 100,
} as const;

export async function adminExams() {
  const exams = await prisma.exam.findMany({
    orderBy: { year: "desc" },
    select: {
      id: true,
      year: true,
      questions: { select: { publishedAt: true, status: true } },
    },
  });
  return exams.map((exam) => ({
    id: exam.id,
    year: exam.year,
    total: exam.questions.length,
    published: exam.questions.filter((question) => question.publishedAt !== null).length,
    anuladas: exam.questions.filter((question) => question.status === "ANULADA").length,
  }));
}

export async function adminExamQuestions(examId: string) {
  return prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      year: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          originalLabel: true,
          type: true,
          status: true,
          publishedAt: true,
          updatedAt: true,
          statementMd: true,
          tags: { select: { topic: { select: { name: true } } } },
          _count: { select: { assets: true } },
        },
      },
    },
  });
}

export function countImageMarkers(source: string): number {
  return parseRichText(source).filter((block) => block.kind === "image").length;
}

export async function adminQuestion(id: string) {
  const question = await prisma.question.findUnique({
    where: { id },
    select: {
      id: true,
      examId: true,
      originalLabel: true,
      type: true,
      area: true,
      status: true,
      statementMd: true,
      valuePoints: true,
      publishedAt: true,
      updatedAt: true,
      exam: { select: { year: true } },
      options: {
        orderBy: { letter: "asc" },
        select: { letter: true, textMd: true, isCorrect: true },
      },
      answerStandards: {
        orderBy: [{ subItem: "asc" }, { id: "asc" }],
        select: {
          id: true,
          subItem: true,
          maxScore: true,
          criteriaMd: true,
          _count: { select: { assets: true } },
        },
      },
      assets: {
        where: { answerStandardId: null },
        orderBy: { filePath: "asc" },
        select: { filePath: true, caption: true },
      },
      tags: { select: { topic: { select: { name: true } } } },
    },
  });
  if (!question) {
    return null;
  }
  return { ...question, imageMarkers: countImageMarkers(question.statementMd) };
}

export async function allTopics(): Promise<string[]> {
  const topics = await prisma.topic.findMany({ orderBy: { name: "asc" }, select: { name: true } });
  return topics.map((topic) => topic.name);
}

export type StandardInput = {
  id: string | null;
  subItem: string | null;
  maxScore: number | null;
  criteriaMd: string;
};

export type QuestionInput = {
  questionId: string;
  expectedUpdatedAt: number;
  statementMd: string;
  area: QuestionArea;
  status: QuestionStatus;
  valuePoints: number | null;
  options: { letter: string; textMd: string }[];
  correctLetter: string | null;
  standards: StandardInput[];
  topics: string[];
};

export type SaveOutcome =
  | { status: "ok"; updatedAt: number }
  | { status: "stale" }
  | { status: "invalid"; message: string };

const LETTERS = ["A", "B", "C", "D", "E"];

class SaveRejected extends Error {}

export async function saveQuestion(input: QuestionInput): Promise<SaveOutcome> {
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ updatedAt: Date; type: string }[]>`
        SELECT "updatedAt", type::text AS type FROM "Question" WHERE id = ${input.questionId} FOR UPDATE`;
      const current = locked[0];
      if (!current) {
        throw new SaveRejected("Questão não encontrada.");
      }
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt) {
        return { status: "stale" } as const;
      }
      const isObjective = current.type === "OBJECTIVE";
      if (isObjective) {
        if (
          input.options.length !== LETTERS.length ||
          input.options.some((option, index) => option.letter !== LETTERS[index])
        ) {
          throw new SaveRejected("A objetiva precisa das alternativas A, B, C, D e E.");
        }
        if (input.status === "VALID" && !input.correctLetter) {
          throw new SaveRejected(
            "Marque a alternativa correta (ou marque a questão como anulada).",
          );
        }
        if (input.standards.length > 0) {
          throw new SaveRejected("Questão objetiva não tem padrão de resposta.");
        }
      } else {
        if (input.options.length > 0 || input.correctLetter) {
          throw new SaveRejected("Questão discursiva não tem alternativas.");
        }
        if (input.standards.length === 0) {
          throw new SaveRejected(
            "A discursiva precisa de pelo menos um item de padrão de resposta.",
          );
        }
      }
      const topicRows = await tx.topic.findMany({
        where: { name: { in: input.topics } },
        select: { id: true, name: true },
      });
      if (topicRows.length !== input.topics.length) {
        throw new SaveRejected("Algum tema escolhido não existe.");
      }
      const existingStandards = await tx.answerStandard.findMany({
        where: { questionId: input.questionId },
        select: { id: true, _count: { select: { assets: true } } },
      });
      const existingIds = new Set(existingStandards.map((standard) => standard.id));
      if (input.standards.some((standard) => standard.id && !existingIds.has(standard.id))) {
        throw new SaveRejected("Item de padrão de resposta inválido.");
      }
      const keptIds = new Set(input.standards.flatMap((standard) => standard.id ?? []));
      const removed = existingStandards.filter((standard) => !keptIds.has(standard.id));
      if (removed.some((standard) => standard._count.assets > 0)) {
        throw new SaveRejected(
          "Um item removido do padrão tem imagem anexada. Remova a imagem antes de apagar o item.",
        );
      }

      await tx.question.update({
        where: { id: input.questionId },
        data: {
          statementMd: input.statementMd,
          area: input.area,
          status: input.status,
          valuePoints: isObjective ? null : input.valuePoints,
        },
      });
      if (isObjective) {
        for (const option of input.options) {
          await tx.option.updateMany({
            where: { questionId: input.questionId, letter: option.letter },
            data: { textMd: option.textMd, isCorrect: option.letter === input.correctLetter },
          });
        }
      }
      if (removed.length > 0) {
        await tx.answerStandard.deleteMany({
          where: { id: { in: removed.map((standard) => standard.id) } },
        });
      }
      for (const standard of input.standards) {
        const data = {
          subItem: standard.subItem,
          maxScore: standard.maxScore,
          criteriaMd: standard.criteriaMd,
        };
        if (standard.id) {
          await tx.answerStandard.update({ where: { id: standard.id }, data });
        } else {
          await tx.answerStandard.create({ data: { ...data, questionId: input.questionId } });
        }
      }
      await tx.questionTag.deleteMany({ where: { questionId: input.questionId } });
      await tx.questionTag.createMany({
        data: topicRows.map((topic) => ({ questionId: input.questionId, topicId: topic.id })),
      });
      const saved = await tx.question.findUniqueOrThrow({
        where: { id: input.questionId },
        select: { updatedAt: true },
      });
      return { status: "ok", updatedAt: saved.updatedAt.getTime() } as const;
    });
  } catch (error) {
    if (error instanceof SaveRejected) {
      return { status: "invalid", message: error.message };
    }
    throw error;
  }
}
