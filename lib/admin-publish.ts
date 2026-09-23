import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publishProblems } from "@/lib/publish-rules";

export const MAX_BULK = 100;

async function candidate(tx: Prisma.TransactionClient, questionId: string) {
  const question = await tx.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      examId: true,
      originalLabel: true,
      type: true,
      status: true,
      statementMd: true,
      publishedAt: true,
      reviewedAt: true,
      options: { select: { letter: true, textMd: true, isCorrect: true } },
      _count: { select: { answerStandards: true, tags: true } },
      assets: { where: { answerStandardId: null }, select: { id: true } },
    },
  });
  if (!question) {
    return null;
  }
  return {
    question,
    problems: publishProblems({
      type: question.type,
      status: question.status,
      statementMd: question.statementMd,
      options: question.options,
      standards: question._count.answerStandards,
      topics: question._count.tags,
      statementAssets: question.assets.length,
      reviewed: question.reviewedAt !== null,
    }),
  };
}

export async function questionPublishProblems(questionId: string): Promise<string[]> {
  const found = await candidate(prisma, questionId);
  return found?.problems ?? ["Questão não encontrada."];
}

export async function openAttemptsWith(questionId: string): Promise<number> {
  return prisma.attempt.count({
    where: {
      status: "IN_PROGRESS",
      mode: { in: ["FULL_EXAM", "CUSTOM"] },
      questionIds: { has: questionId },
    },
  });
}

async function lock(tx: Prisma.TransactionClient, questionId: string) {
  await tx.$queryRaw`SELECT id FROM "Question" WHERE id = ${questionId} FOR UPDATE`;
}

export type PublishResult =
  { status: "ok" } | { status: "problems"; problems: string[] } | { status: "missing" };

export async function setPublished(questionId: string, publish: boolean): Promise<PublishResult> {
  return prisma.$transaction(async (tx) => {
    await lock(tx, questionId);
    const found = await candidate(tx, questionId);
    if (!found) {
      return { status: "missing" } as const;
    }
    if (publish && found.problems.length > 0) {
      return { status: "problems", problems: found.problems } as const;
    }
    if (publish && found.question.publishedAt === null) {
      await tx.question.update({ where: { id: questionId }, data: { publishedAt: new Date() } });
    }
    if (!publish && found.question.publishedAt !== null) {
      await tx.question.update({ where: { id: questionId }, data: { publishedAt: null } });
    }
    return { status: "ok" } as const;
  });
}

export type BulkResult = {
  changed: number;
  unchanged: number;
  skipped: { label: string; problems: string[] }[];
};

export async function bulkSetPublished(
  examId: string,
  questionIds: string[],
  publish: boolean,
): Promise<BulkResult | null> {
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds }, examId },
    orderBy: { order: "asc" },
    select: { id: true, originalLabel: true, publishedAt: true },
  });
  if (questions.length !== questionIds.length) {
    return null;
  }
  const result: BulkResult = { changed: 0, unchanged: 0, skipped: [] };
  for (const question of questions) {
    if ((question.publishedAt !== null) === publish) {
      result.unchanged += 1;
      continue;
    }
    const outcome = await setPublished(question.id, publish);
    if (outcome.status === "ok") {
      result.changed += 1;
    } else if (outcome.status === "problems") {
      result.skipped.push({ label: question.originalLabel, problems: outcome.problems });
    }
  }
  return result;
}
