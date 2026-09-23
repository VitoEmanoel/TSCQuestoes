import "server-only";
import { Prisma } from "@prisma/client";
import type { ImportedQuestion } from "@/lib/exam-import";
import { prisma } from "@/lib/prisma";
import { deleteUpload } from "@/lib/uploads";

export const DEFAULT_COURSE = "Tecnologia em Análise e Desenvolvimento de Sistemas";

export type CreateExamOutcome = { status: "ok"; examId: string } | { status: "exists" };

export async function createExamFromImport(input: {
  year: number;
  course: string;
  questions: ImportedQuestion[];
}): Promise<CreateExamOutcome> {
  const formacaoGeral = await prisma.topic.findUnique({
    where: { name: "Formação Geral" },
    select: { id: true },
  });
  try {
    return await prisma.$transaction(
      async (tx) => {
        const exam = await tx.exam.create({
          data: { year: input.year, course: input.course },
          select: { id: true },
        });
        for (const question of input.questions) {
          const created = await tx.question.create({
            data: {
              examId: exam.id,
              originalLabel: question.label,
              order: question.order,
              type: question.type,
              area: question.area,
              status: question.status,
              statementMd: question.statementMd,
              valuePoints: question.valuePoints,
              publishedAt: null,
            },
            select: { id: true },
          });
          if (question.options.length > 0) {
            await tx.option.createMany({
              data: question.options.map((option) => ({ ...option, questionId: created.id })),
            });
          }
          if (question.standards.length > 0) {
            await tx.answerStandard.createMany({
              data: question.standards.map((standard) => ({
                ...standard,
                questionId: created.id,
              })),
            });
          }
          if (question.area === "FORMACAO_GERAL" && formacaoGeral) {
            await tx.questionTag.create({
              data: { questionId: created.id, topicId: formacaoGeral.id },
            });
          }
        }
        return { status: "ok", examId: exam.id } as const;
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: "exists" };
    }
    throw error;
  }
}

export async function examDeletionBlockers(examId: string) {
  const [published, answered, rooms, replays] = await Promise.all([
    prisma.question.count({ where: { examId, publishedAt: { not: null } } }),
    prisma.attemptItem.count({ where: { question: { examId } } }),
    prisma.roomQuestion.count({ where: { question: { examId } } }),
    prisma.attempt.count({ where: { examId } }),
  ]);
  return { published, answered, rooms, replays, total: published + answered + rooms + replays };
}

export async function deleteDraftExam(examId: string): Promise<boolean> {
  const files = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Exam" WHERE id = ${examId} FOR UPDATE`;
    if (locked.length === 0) {
      return null;
    }
    const [published, answered, rooms, replays] = await Promise.all([
      tx.question.count({ where: { examId, publishedAt: { not: null } } }),
      tx.attemptItem.count({ where: { question: { examId } } }),
      tx.roomQuestion.count({ where: { question: { examId } } }),
      tx.attempt.count({ where: { examId } }),
    ]);
    if (published + answered + rooms + replays > 0) {
      return null;
    }
    const uploads = await tx.asset.findMany({
      where: { question: { examId }, filePath: { startsWith: "uploads/" } },
      select: { filePath: true },
    });
    await tx.asset.deleteMany({ where: { question: { examId } } });
    await tx.option.deleteMany({ where: { question: { examId } } });
    await tx.answerStandard.deleteMany({ where: { question: { examId } } });
    await tx.questionTag.deleteMany({ where: { question: { examId } } });
    await tx.question.deleteMany({ where: { examId } });
    await tx.exam.delete({ where: { id: examId } });
    return uploads.map((asset) => asset.filePath);
  });
  if (files === null) {
    return false;
  }
  for (const file of files) {
    await deleteUpload(file);
  }
  return true;
}
