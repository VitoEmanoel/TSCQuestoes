import "server-only";
import { Prisma, type QuestionArea, type QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteUpload } from "@/lib/uploads";

export const LABEL_PATTERN = /^[A-Z]{0,2}\d{1,3}$/;
const LETTERS = ["A", "B", "C", "D", "E"];

export function normalizeLabel(raw: string): string | null {
  const label = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!LABEL_PATTERN.test(label)) {
    return null;
  }
  return label.replace(/^([A-Z]*)0+(\d)/, "$1$2");
}

export type CreateOutcome =
  { status: "ok"; questionId: string } | { status: "duplicate" } | { status: "missing" };

export async function createQuestion(input: {
  examId: string;
  type: QuestionType;
  area: QuestionArea;
  label: string;
}): Promise<CreateOutcome> {
  try {
    return await prisma.$transaction(async (tx) => {
      const exam = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Exam" WHERE id = ${input.examId} FOR UPDATE`;
      if (exam.length === 0) {
        return { status: "missing" } as const;
      }
      const last = await tx.question.findFirst({
        where: { examId: input.examId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const question = await tx.question.create({
        data: {
          examId: input.examId,
          originalLabel: input.label,
          order: (last?.order ?? 0) + 1,
          type: input.type,
          area: input.area,
          statementMd: "",
          publishedAt: null,
          reviewedAt: null,
        },
        select: { id: true },
      });
      if (input.type === "OBJECTIVE") {
        await tx.option.createMany({
          data: LETTERS.map((letter) => ({
            questionId: question.id,
            letter,
            textMd: "",
            isCorrect: false,
          })),
        });
      } else {
        await tx.answerStandard.create({
          data: { questionId: question.id, subItem: null, maxScore: null, criteriaMd: "" },
        });
      }
      if (input.area === "FORMACAO_GERAL") {
        const topic = await tx.topic.findUnique({
          where: { name: "Formação Geral" },
          select: { id: true },
        });
        if (topic) {
          await tx.questionTag.create({ data: { questionId: question.id, topicId: topic.id } });
        }
      }
      return { status: "ok", questionId: question.id } as const;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "duplicate" };
    }
    throw error;
  }
}

export async function questionUsage(questionId: string) {
  const [answers, rooms, attempts] = await Promise.all([
    prisma.attemptItem.count({ where: { questionId } }),
    prisma.roomQuestion.count({ where: { questionId } }),
    prisma.attempt.count({ where: { questionIds: { has: questionId } } }),
  ]);
  return { answers, rooms, attempts, total: answers + rooms + attempts };
}

export type DeleteOutcome = { status: "ok"; examId: string } | { status: "used" | "missing" };

export async function deleteQuestion(questionId: string): Promise<DeleteOutcome> {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ examId: string }[]>`
      SELECT "examId" FROM "Question" WHERE id = ${questionId} FOR UPDATE`;
    if (locked.length === 0) {
      return { outcome: { status: "missing" } as const, files: [] as string[] };
    }
    const [answers, rooms, attempts] = await Promise.all([
      tx.attemptItem.count({ where: { questionId } }),
      tx.roomQuestion.count({ where: { questionId } }),
      tx.attempt.count({ where: { questionIds: { has: questionId } } }),
    ]);
    if (answers + rooms + attempts > 0) {
      return { outcome: { status: "used" } as const, files: [] as string[] };
    }
    const uploads = await tx.asset.findMany({
      where: { questionId, filePath: { startsWith: "uploads/" } },
      select: { filePath: true },
    });
    await tx.asset.deleteMany({ where: { questionId } });
    await tx.option.deleteMany({ where: { questionId } });
    await tx.answerStandard.deleteMany({ where: { questionId } });
    await tx.questionTag.deleteMany({ where: { questionId } });
    await tx.question.delete({ where: { id: questionId } });
    return {
      outcome: { status: "ok", examId: locked[0].examId } as const,
      files: uploads.map((asset) => asset.filePath),
    };
  });
  for (const file of result.files) {
    await deleteUpload(file);
  }
  return result.outcome;
}

export async function moveQuestion(questionId: string, direction: "up" | "down") {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ examId: string }[]>`
      SELECT "examId" FROM "Question" WHERE id = ${questionId}`;
    if (locked.length === 0) {
      return null;
    }
    await tx.$queryRaw`SELECT id FROM "Exam" WHERE id = ${locked[0].examId} FOR UPDATE`;
    const siblings = await tx.question.findMany({
      where: { examId: locked[0].examId },
      orderBy: [{ order: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const index = siblings.findIndex((item) => item.id === questionId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index >= 0 && target >= 0 && target < siblings.length) {
      [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
      for (const [position, item] of siblings.entries()) {
        await tx.question.update({ where: { id: item.id }, data: { order: position + 1 } });
      }
    }
    return locked[0].examId;
  });
}

export type RenameOutcome = "ok" | "duplicate" | "missing";

export async function renameQuestion(questionId: string, label: string): Promise<RenameOutcome> {
  try {
    const updated = await prisma.question.updateMany({
      where: { id: questionId },
      data: { originalLabel: label },
    });
    return updated.count === 1 ? "ok" : "missing";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "duplicate";
    }
    throw error;
  }
}
