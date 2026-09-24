import "server-only";
import type { RevealPolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PUBLISHED } from "@/lib/questions";
import { SCORED_QUESTION, scoreAttempt, summarize } from "@/lib/attempt-score";
import { latestPerQuestion, type ScoreSlot, slotsFor, topicPerformance } from "@/lib/scoring";

export const REVEAL_POLICIES = ["IMMEDIATE", "AT_END", "MANUAL"] as const;

export const REVEAL_POLICY_LABEL: Record<RevealPolicy, string> = {
  IMMEDIATE: "Na hora",
  AT_END: "Ao finalizar a sessão",
  MANUAL: "Quando eu pedir",
};

export type RevealedObjectiveResult = {
  status: "revealed";
  itemId: string;
  letter: string;
  isCorrect: boolean | null;
  correctLetter: string | null;
  isAnulada: boolean;
  answeredAt: string;
};

export type PendingObjectiveResult = {
  status: "pending";
  itemId: string;
  letter: string;
  policy: "AT_END" | "MANUAL";
  answeredAt: string;
};

export type ObjectiveResult = RevealedObjectiveResult | PendingObjectiveResult;

async function openPracticeAttempt(userId: string) {
  return prisma.attempt.findFirst({
    where: { userId, mode: "PRACTICE", status: "IN_PROGRESS" },
    orderBy: { startedAt: "asc" },
    select: { id: true, revealPolicy: true },
  });
}

async function lastPracticePolicy(userId: string): Promise<RevealPolicy> {
  const previous = await prisma.attempt.findFirst({
    where: { userId, mode: "PRACTICE" },
    orderBy: { startedAt: "desc" },
    select: { revealPolicy: true },
  });
  return previous?.revealPolicy ?? "IMMEDIATE";
}

async function currentPracticeAttempt(userId: string) {
  const existing = await openPracticeAttempt(userId);
  if (existing) {
    return existing;
  }
  return prisma.attempt.create({
    data: { userId, mode: "PRACTICE", revealPolicy: await lastPracticePolicy(userId) },
    select: { id: true, revealPolicy: true },
  });
}

export async function practiceSession(userId: string) {
  const attempt = await openPracticeAttempt(userId);
  if (!attempt) {
    return { policy: await lastPracticePolicy(userId), answered: 0, pending: 0 };
  }
  const [answered, pending] = await Promise.all([
    prisma.attemptItem.count({ where: { attemptId: attempt.id } }),
    prisma.attemptItem.count({ where: { attemptId: attempt.id, revealedAt: null } }),
  ]);
  return { policy: attempt.revealPolicy, answered, pending };
}

export async function setRevealPolicy(
  userId: string,
  policy: RevealPolicy,
): Promise<"ok" | "pending"> {
  const attempt = await currentPracticeAttempt(userId);
  if (attempt.revealPolicy === policy) {
    return "ok";
  }
  const [answered, pending] = await Promise.all([
    prisma.attemptItem.count({ where: { attemptId: attempt.id } }),
    prisma.attemptItem.count({ where: { attemptId: attempt.id, revealedAt: null } }),
  ]);
  if (pending > 0) {
    return "pending";
  }
  if (answered === 0) {
    await prisma.attempt.update({ where: { id: attempt.id }, data: { revealPolicy: policy } });
    return "ok";
  }
  await prisma.$transaction([
    prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        autoScore: (await scoreAttempt(attempt.id)).percent,
      },
    }),
    prisma.attempt.create({ data: { userId, mode: "PRACTICE", revealPolicy: policy } }),
  ]);
  return "ok";
}

export async function finishPracticeSession(userId: string): Promise<string | null> {
  const attempt = await openPracticeAttempt(userId);
  if (!attempt || attempt.revealPolicy === "IMMEDIATE") {
    return null;
  }
  if ((await prisma.attemptItem.count({ where: { attemptId: attempt.id } })) === 0) {
    return null;
  }
  const now = new Date();
  const summary = await scoreAttempt(attempt.id);
  await prisma.$transaction([
    prisma.attemptItem.updateMany({
      where: { attemptId: attempt.id, revealedAt: null },
      data: { revealedAt: now },
    }),
    prisma.attempt.update({
      where: { id: attempt.id },
      data: { status: "SUBMITTED", submittedAt: now, autoScore: summary.percent },
    }),
  ]);
  return attempt.id;
}

async function objectiveKey(questionId: string, publishedOnly: boolean) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, ...(publishedOnly ? PUBLISHED : {}) },
    select: {
      type: true,
      status: true,
      options: { select: { letter: true, isCorrect: true } },
    },
  });
  if (!question || question.type !== "OBJECTIVE") {
    return null;
  }
  return {
    letters: question.options.map((option) => option.letter),
    isAnulada: question.status === "ANULADA",
    correctLetter: question.options.find((option) => option.isCorrect)?.letter ?? null,
  };
}

function revealedResult(
  item: { id: string; selectedLetter: string | null; isCorrect: boolean | null; answeredAt: Date },
  key: { isAnulada: boolean; correctLetter: string | null },
): RevealedObjectiveResult {
  return {
    status: "revealed",
    itemId: item.id,
    letter: item.selectedLetter ?? "",
    isCorrect: item.isCorrect,
    correctLetter: key.isAnulada ? null : key.correctLetter,
    isAnulada: key.isAnulada,
    answeredAt: item.answeredAt.toISOString(),
  };
}

export async function answerObjective(
  userId: string,
  questionId: string,
  letter: string,
): Promise<ObjectiveResult | null> {
  const key = await objectiveKey(questionId, true);
  if (!key || !key.letters.includes(letter)) {
    return null;
  }
  const attempt = await currentPracticeAttempt(userId);
  const immediate = attempt.revealPolicy === "IMMEDIATE";
  const now = new Date();
  const item = await prisma.attemptItem.create({
    data: {
      attemptId: attempt.id,
      questionId,
      selectedLetter: letter,
      isCorrect: key.isAnulada ? null : letter === key.correctLetter,
      revealedAt: immediate ? now : null,
      answeredAt: now,
    },
    select: { id: true, selectedLetter: true, isCorrect: true, answeredAt: true },
  });
  if (immediate) {
    return revealedResult(item, key);
  }
  return {
    status: "pending",
    itemId: item.id,
    letter,
    policy: attempt.revealPolicy === "MANUAL" ? "MANUAL" : "AT_END",
    answeredAt: now.toISOString(),
  };
}

async function revealableItem(userId: string, itemId: string) {
  return prisma.attemptItem.findFirst({
    where: {
      id: itemId,
      attempt: {
        userId,
        mode: "PRACTICE",
        OR: [{ revealPolicy: "MANUAL" }, { revealPolicy: "IMMEDIATE" }, { status: "SUBMITTED" }],
      },
    },
    select: {
      id: true,
      questionId: true,
      selectedLetter: true,
      isCorrect: true,
      answeredAt: true,
      revealedAt: true,
    },
  });
}

export async function revealObjective(
  userId: string,
  itemId: string,
): Promise<RevealedObjectiveResult | null> {
  const item = await revealableItem(userId, itemId);
  if (!item || item.selectedLetter === null) {
    return null;
  }
  const key = await objectiveKey(item.questionId, false);
  if (!key) {
    return null;
  }
  if (item.revealedAt === null) {
    await prisma.attemptItem.update({ where: { id: item.id }, data: { revealedAt: new Date() } });
  }
  return revealedResult(item, key);
}

export async function revealDiscursive(userId: string, itemId: string): Promise<string | null> {
  const item = await revealableItem(userId, itemId);
  if (!item || item.selectedLetter !== null) {
    return null;
  }
  if (item.revealedAt === null) {
    await prisma.attemptItem.update({ where: { id: item.id }, data: { revealedAt: new Date() } });
  }
  return item.questionId;
}

export async function lastObjectiveAnswer(userId: string, questionId: string) {
  return prisma.attemptItem.findFirst({
    where: { questionId, attempt: { userId, mode: "PRACTICE" }, selectedLetter: { not: null } },
    orderBy: { answeredAt: "desc" },
    select: {
      id: true,
      selectedLetter: true,
      isCorrect: true,
      answeredAt: true,
      revealedAt: true,
      attempt: { select: { revealPolicy: true } },
    },
  });
}

export const MAX_ANSWER_LENGTH = 5000;

export type { ScoreSlot };

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
  return slotsFor(question.valuePoints, question.answerStandards);
}

export async function answerDiscursive(
  userId: string,
  questionId: string,
  answerText: string,
): Promise<string | null> {
  const question = await prisma.question.findFirst({
    where: { id: questionId, ...PUBLISHED },
    select: { type: true },
  });
  if (!question || question.type !== "DISCURSIVE") {
    return null;
  }
  const attempt = await currentPracticeAttempt(userId);
  const now = new Date();
  const item = await prisma.attemptItem.create({
    data: {
      attemptId: attempt.id,
      questionId,
      answerText,
      revealedAt: attempt.revealPolicy === "IMMEDIATE" ? now : null,
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
    select: {
      id: true,
      answerText: true,
      answeredAt: true,
      revealedAt: true,
      selfScore: true,
      selfScores: true,
      attempt: { select: { revealPolicy: true } },
    },
  });
}

export async function saveSelfEvaluation(
  userId: string,
  itemId: string,
  scores: Record<string, number>,
): Promise<{ total: number } | null> {
  const item = await prisma.attemptItem.findFirst({
    where: {
      id: itemId,
      attempt: { userId, mode: { in: ["PRACTICE", "FULL_EXAM", "CUSTOM"] } },
      answerText: { not: null },
      revealedAt: { not: null },
    },
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

export async function practiceSessionResults(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId, mode: "PRACTICE", status: "SUBMITTED" },
    select: {
      id: true,
      revealPolicy: true,
      startedAt: true,
      submittedAt: true,
      items: {
        orderBy: { answeredAt: "asc" },
        select: {
          id: true,
          questionId: true,
          selectedLetter: true,
          answerText: true,
          selfScore: true,
          answeredAt: true,
          question: {
            select: {
              ...SCORED_QUESTION,
              tags: { select: { topic: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!attempt) {
    return null;
  }
  const topics = topicPerformance(
    latestPerQuestion(attempt.items).map((item) => ({
      topics: item.question.tags.map((tag) => tag.topic.name),
      type: item.question.type,
      anulada: item.question.status === "ANULADA",
      answered: true,
      correct:
        item.selectedLetter !== null &&
        item.selectedLetter === (item.question.options[0]?.letter ?? null),
      selfScore: item.selfScore,
      maxPoints: slotsFor(item.question.valuePoints, item.question.answerStandards).reduce(
        (sum, slot) => sum + slot.max,
        0,
      ),
    })),
  );
  return { ...attempt, summary: summarize(attempt.items), topics };
}
