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
