import "server-only";
import { prisma } from "@/lib/prisma";

export type ObjectiveResult = {
  letter: string;
  isCorrect: boolean | null;
  correctLetter: string | null;
  isAnulada: boolean;
  answeredAt: string;
};

async function practiceAttemptId(userId: string): Promise<string> {
  const existing = await prisma.attempt.findFirst({
    where: { userId, mode: "PRACTICE", status: "IN_PROGRESS" },
    orderBy: { startedAt: "asc" },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  const created = await prisma.attempt.create({
    data: { userId, mode: "PRACTICE", revealPolicy: "IMMEDIATE" },
    select: { id: true },
  });
  return created.id;
}

export async function answerObjective(
  userId: string,
  questionId: string,
  letter: string,
): Promise<ObjectiveResult | null> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      type: true,
      status: true,
      options: { select: { letter: true, isCorrect: true } },
    },
  });
  if (!question || question.type !== "OBJECTIVE") {
    return null;
  }
  if (!question.options.some((option) => option.letter === letter)) {
    return null;
  }

  const isAnulada = question.status === "ANULADA";
  const correctLetter = question.options.find((option) => option.isCorrect)?.letter ?? null;
  const isCorrect = isAnulada ? null : letter === correctLetter;
  const now = new Date();

  await prisma.attemptItem.create({
    data: {
      attemptId: await practiceAttemptId(userId),
      questionId,
      selectedLetter: letter,
      isCorrect,
      revealedAt: now,
      answeredAt: now,
    },
  });

  return {
    letter,
    isCorrect,
    correctLetter: isAnulada ? null : correctLetter,
    isAnulada,
    answeredAt: now.toISOString(),
  };
}

export async function lastObjectiveAnswer(userId: string, questionId: string) {
  return prisma.attemptItem.findFirst({
    where: { questionId, attempt: { userId, mode: "PRACTICE" }, selectedLetter: { not: null } },
    orderBy: { answeredAt: "desc" },
    select: { selectedLetter: true, isCorrect: true, answeredAt: true },
  });
}

export const MAX_ANSWER_LENGTH = 5000;

export type ScoreSlot = { key: string; label: string; max: number };

export async function scoreSlots(questionId: string): Promise<ScoreSlot[] | null> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      type: true,
      valuePoints: true,
      answerStandards: { orderBy: { subItem: "asc" }, select: { subItem: true, maxScore: true } },
    },
  });
  if (!question || question.type !== "DISCURSIVE") {
    return null;
  }
  const withSubItems = question.answerStandards.filter((standard) => standard.subItem !== null);
  if (withSubItems.length > 0 && withSubItems.every((standard) => standard.maxScore !== null)) {
    return withSubItems.map((standard) => ({
      key: standard.subItem!,
      label: `Item ${standard.subItem})`,
      max: standard.maxScore!,
    }));
  }
  const total =
    question.answerStandards.length === 1 && question.answerStandards[0].maxScore !== null
      ? question.answerStandards[0].maxScore
      : (question.valuePoints ?? 10);
  return [{ key: "total", label: "Nota", max: total }];
}

export async function answerDiscursive(
  userId: string,
  questionId: string,
  answerText: string,
): Promise<string | null> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { type: true },
  });
  if (!question || question.type !== "DISCURSIVE") {
    return null;
  }
  const now = new Date();
  const item = await prisma.attemptItem.create({
    data: {
      attemptId: await practiceAttemptId(userId),
      questionId,
      answerText,
      revealedAt: now,
      answeredAt: now,
    },
    select: { id: true },
  });
  return item.id;
}

export async function lastDiscursiveAnswer(userId: string, questionId: string) {
  return prisma.attemptItem.findFirst({
    where: { questionId, attempt: { userId, mode: "PRACTICE" }, answerText: { not: null } },
    orderBy: { answeredAt: "desc" },
    select: { id: true, answerText: true, answeredAt: true, selfScore: true, selfScores: true },
  });
}

export async function saveSelfEvaluation(
  userId: string,
  itemId: string,
  scores: Record<string, number>,
): Promise<{ total: number } | null> {
  const item = await prisma.attemptItem.findFirst({
    where: { id: itemId, attempt: { userId, mode: "PRACTICE" }, answerText: { not: null } },
    select: { id: true, questionId: true },
  });
  if (!item) {
    return null;
  }
  const slots = await scoreSlots(item.questionId);
  if (!slots) {
    return null;
  }
  const expected = new Set(slots.map((slot) => slot.key));
  if (Object.keys(scores).some((key) => !expected.has(key))) {
    return null;
  }
  for (const slot of slots) {
    const value = scores[slot.key];
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > slot.max) {
      return null;
    }
  }
  const total = Math.round(slots.reduce((sum, slot) => sum + scores[slot.key], 0) * 100) / 100;
  await prisma.attemptItem.update({
    where: { id: item.id },
    data: { selfScore: total, selfScores: scores },
  });
  return { total };
}
