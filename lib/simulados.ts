import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma, QuestionArea, QuestionType } from "@prisma/client";
import { SCORED_QUESTION, summarize } from "@/lib/attempt-score";
import { prisma } from "@/lib/prisma";

export const MAX_SIMULADO_ANSWER_LENGTH = 5000;
export const MAX_CUSTOM_QUESTIONS = 40;
export const MAX_OPEN_CUSTOM = 5;
export const TIME_LIMIT_MINUTES = [15, 30, 60, 90, 120, 180, 240] as const;

const SIMULADO_MODES = ["FULL_EXAM", "CUSTOM"] as const;

export async function listReplayExams(userId: string) {
  const [exams, inProgress] = await Promise.all([
    prisma.exam.findMany({
      orderBy: { year: "desc" },
      select: {
        id: true,
        year: true,
        questions: { select: { type: true, status: true } },
      },
    }),
    prisma.attempt.findMany({
      where: { userId, mode: "FULL_EXAM", status: "IN_PROGRESS" },
      select: { id: true, examId: true, _count: { select: { items: true } } },
    }),
  ]);
  return exams.map((exam) => {
    const open = inProgress.find((attempt) => attempt.examId === exam.id);
    return {
      id: exam.id,
      year: exam.year,
      total: exam.questions.length,
      objectives: exam.questions.filter((question) => question.type === "OBJECTIVE").length,
      discursives: exam.questions.filter((question) => question.type === "DISCURSIVE").length,
      anuladas: exam.questions.filter((question) => question.status === "ANULADA").length,
      openAttempt: open ? { id: open.id, answered: open._count.items } : null,
    };
  });
}

export async function startReplay(
  userId: string,
  examId: string,
  minutes: number | null,
): Promise<string | null> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) {
    return null;
  }
  const questions = await prisma.question.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const open = await tx.attempt.findFirst({
      where: { userId, mode: "FULL_EXAM", status: "IN_PROGRESS", examId },
      select: { id: true },
    });
    if (open) {
      return open.id;
    }
    const created = await tx.attempt.create({
      data: {
        userId,
        mode: "FULL_EXAM",
        examId,
        revealPolicy: "AT_END",
        questionIds: questions.map((question) => question.id),
        timeLimitSec: minutes ? minutes * 60 : null,
      },
      select: { id: true },
    });
    return created.id;
  });
}

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`simulado:${userId}`}))`;
}

export type CustomFilters = {
  years: number[];
  area?: QuestionArea;
  type?: QuestionType;
  topics: string[];
  count: number;
  minutes: number | null;
};

export type CatalogEntry = {
  year: number;
  area: QuestionArea;
  type: QuestionType;
  topics: string[];
};

export async function customCatalog(): Promise<CatalogEntry[]> {
  const questions = await prisma.question.findMany({
    where: { status: "VALID" },
    select: {
      area: true,
      type: true,
      exam: { select: { year: true } },
      tags: { select: { topic: { select: { name: true } } } },
    },
  });
  return questions.map((question) => ({
    year: question.exam.year,
    area: question.area,
    type: question.type,
    topics: question.tags.map((tag) => tag.topic.name),
  }));
}

export type CreateCustomOutcome =
  { status: "ok"; attemptId: string; picked: number } | { status: "empty" } | { status: "limit" };

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export async function createCustomSimulado(
  userId: string,
  filters: CustomFilters,
): Promise<CreateCustomOutcome> {
  const candidates = await prisma.question.findMany({
    where: {
      status: "VALID",
      ...(filters.years.length > 0 ? { exam: { year: { in: filters.years } } } : {}),
      ...(filters.area ? { area: filters.area } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.topics.length > 0
        ? { tags: { some: { topic: { name: { in: filters.topics } } } } }
        : {}),
    },
    select: { id: true },
  });
  if (candidates.length === 0) {
    return { status: "empty" };
  }
  const picked = shuffled(candidates.map((question) => question.id)).slice(0, filters.count);
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const open = await tx.attempt.count({
      where: { userId, mode: "CUSTOM", status: "IN_PROGRESS" },
    });
    if (open >= MAX_OPEN_CUSTOM) {
      return { status: "limit" } as const;
    }
    const created = await tx.attempt.create({
      data: {
        userId,
        mode: "CUSTOM",
        revealPolicy: "AT_END",
        questionIds: picked,
        timeLimitSec: filters.minutes ? filters.minutes * 60 : null,
      },
      select: { id: true },
    });
    return { status: "ok", attemptId: created.id, picked: picked.length } as const;
  });
}

export async function openCustomSimulados(userId: string) {
  const attempts = await prisma.attempt.findMany({
    where: { userId, mode: "CUSTOM", status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      startedAt: true,
      timeLimitSec: true,
      questionIds: true,
      _count: { select: { items: true } },
    },
  });
  return attempts.map((attempt) => ({
    id: attempt.id,
    startedAt: attempt.startedAt,
    timeLimitSec: attempt.timeLimitSec,
    total: attempt.questionIds.length,
    answered: attempt._count.items,
  }));
}

async function examQuestionIds(examId: string | null): Promise<string[]> {
  if (!examId) {
    return [];
  }
  const questions = await prisma.question.findMany({
    where: { examId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  return questions.map((question) => question.id);
}

async function questionIdsOf(attempt: { examId: string | null; questionIds: string[] }) {
  return attempt.questionIds.length > 0 ? attempt.questionIds : examQuestionIds(attempt.examId);
}

export async function simuladoOverview(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId, mode: { in: [...SIMULADO_MODES] } },
    select: {
      id: true,
      mode: true,
      examId: true,
      questionIds: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      timeLimitSec: true,
    },
  });
  if (!attempt) {
    return null;
  }
  const ids = await questionIdsOf(attempt);
  const [questions, items, exam] = await Promise.all([
    prisma.question.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        originalLabel: true,
        type: true,
        status: true,
        exam: { select: { year: true } },
      },
    }),
    prisma.attemptItem.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true, selectedLetter: true, answerText: true, answeredAt: true },
    }),
    attempt.examId
      ? prisma.exam.findUnique({ where: { id: attempt.examId }, select: { year: true } })
      : Promise.resolve(null),
  ]);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = new Map(items.map((item) => [item.questionId, item]));
  return {
    attempt,
    year: exam?.year ?? null,
    questions: ids.flatMap((id) => {
      const question = byId.get(id);
      return question ? [{ ...question, answer: answers.get(id) ?? null }] : [];
    }),
  };
}

export async function simuladoQuestion(questionId: string) {
  return prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      originalLabel: true,
      type: true,
      area: true,
      status: true,
      statementMd: true,
      valuePoints: true,
      assets: {
        where: { answerStandardId: null },
        orderBy: { filePath: "asc" },
        select: { filePath: true, caption: true },
      },
      options: { orderBy: { letter: "asc" }, select: { letter: true, textMd: true } },
    },
  });
}

export const SAVE_GRACE_MS = 10_000;

export function deadlineOf(attempt: { startedAt: Date; timeLimitSec: number | null }) {
  return attempt.timeLimitSec
    ? new Date(attempt.startedAt.getTime() + attempt.timeLimitSec * 1000)
    : null;
}

export function remainingSeconds(attempt: { startedAt: Date; timeLimitSec: number | null }) {
  const deadline = deadlineOf(attempt);
  return deadline ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000)) : null;
}

export function closedByTime(attempt: {
  startedAt: Date;
  timeLimitSec: number | null;
  submittedAt: Date | null;
}) {
  const deadline = deadlineOf(attempt);
  return Boolean(deadline && attempt.submittedAt && attempt.submittedAt >= deadline);
}

type LockedAttempt = {
  examId: string | null;
  questionIds: string[];
  status: string;
  startedAt: Date;
  timeLimitSec: number | null;
};

async function lockOwnedAttempt(
  tx: Prisma.TransactionClient,
  userId: string,
  attemptId: string,
): Promise<LockedAttempt | null> {
  const rows = await tx.$queryRaw<LockedAttempt[]>`
    SELECT "examId", "questionIds", status::text AS status, "startedAt", "timeLimitSec"
    FROM "Attempt"
    WHERE id = ${attemptId} AND "userId" = ${userId} AND mode IN ('FULL_EXAM', 'CUSTOM')
    FOR UPDATE`;
  return rows[0] ?? null;
}

function expired(attempt: LockedAttempt, graceMs: number): Date | null {
  const deadline = deadlineOf(attempt);
  return deadline && Date.now() > deadline.getTime() + graceMs ? deadline : null;
}

async function closeLocked(tx: Prisma.TransactionClient, attemptId: string, submittedAt: Date) {
  const items = await tx.attemptItem.findMany({
    where: { attemptId },
    select: {
      id: true,
      questionId: true,
      answeredAt: true,
      selectedLetter: true,
      selfScore: true,
      question: { select: SCORED_QUESTION },
    },
  });
  const now = new Date();
  for (const item of items) {
    const correctLetter = item.question.options[0]?.letter ?? null;
    await tx.attemptItem.update({
      where: { id: item.id },
      data: {
        revealedAt: now,
        isCorrect:
          item.question.type === "OBJECTIVE" && item.question.status === "VALID"
            ? item.selectedLetter === correctLetter
            : null,
      },
    });
  }
  await tx.attempt.update({
    where: { id: attemptId },
    data: { status: "SUBMITTED", submittedAt, autoScore: summarize(items).percent },
  });
}

export async function closeIfExpired(userId: string, attemptId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const attempt = await lockOwnedAttempt(tx, userId, attemptId);
    const deadline = attempt?.status === "IN_PROGRESS" ? expired(attempt, 0) : null;
    if (deadline) {
      await closeLocked(tx, attemptId, deadline);
    }
  });
}

export async function closeExpiredSimulados(userId: string): Promise<void> {
  const open = await prisma.attempt.findMany({
    where: {
      userId,
      mode: { in: [...SIMULADO_MODES] },
      status: "IN_PROGRESS",
      timeLimitSec: { not: null },
    },
    select: { id: true, startedAt: true, timeLimitSec: true },
  });
  for (const attempt of open) {
    const deadline = deadlineOf(attempt);
    if (deadline && Date.now() > deadline.getTime()) {
      await closeIfExpired(userId, attempt.id);
    }
  }
}

export type SaveAnswer = { letter: string } | { text: string };

export async function saveSimuladoAnswer(
  userId: string,
  attemptId: string,
  questionId: string,
  answer: SaveAnswer,
): Promise<"ok" | "closed" | "invalid"> {
  return prisma.$transaction(async (tx) => {
    const attempt = await lockOwnedAttempt(tx, userId, attemptId);
    if (!attempt) {
      return "invalid";
    }
    if (attempt.status !== "IN_PROGRESS") {
      return "closed";
    }
    const deadline = expired(attempt, SAVE_GRACE_MS);
    if (deadline) {
      await closeLocked(tx, attemptId, deadline);
      return "closed";
    }
    if (!(await questionIdsOf(attempt)).includes(questionId)) {
      return "invalid";
    }
    const question = await tx.question.findUnique({
      where: { id: questionId },
      select: { type: true, options: { select: { letter: true } } },
    });
    if (!question) {
      return "invalid";
    }
    const data =
      question.type === "OBJECTIVE" && "letter" in answer
        ? question.options.some((option) => option.letter === answer.letter)
          ? { selectedLetter: answer.letter, answerText: null }
          : null
        : question.type === "DISCURSIVE" && "text" in answer
          ? answer.text.length > 0 && answer.text.length <= MAX_SIMULADO_ANSWER_LENGTH
            ? { answerText: answer.text, selectedLetter: null }
            : null
          : null;
    if (!data) {
      return "invalid";
    }
    const existing = await tx.attemptItem.findFirst({
      where: { attemptId, questionId },
      select: { id: true },
    });
    if (existing) {
      await tx.attemptItem.update({
        where: { id: existing.id },
        data: { ...data, answeredAt: new Date() },
      });
    } else {
      await tx.attemptItem.create({ data: { attemptId, questionId, ...data } });
    }
    return "ok";
  });
}

export async function submitSimulado(
  userId: string,
  attemptId: string,
): Promise<"ok" | "closed" | "invalid"> {
  return prisma.$transaction(async (tx) => {
    const attempt = await lockOwnedAttempt(tx, userId, attemptId);
    if (!attempt) {
      return "invalid";
    }
    if (attempt.status !== "IN_PROGRESS") {
      return "closed";
    }
    await closeLocked(tx, attemptId, expired(attempt, SAVE_GRACE_MS) ?? new Date());
    return "ok";
  });
}

export async function simuladoResult(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: {
      id: attemptId,
      userId,
      mode: { in: [...SIMULADO_MODES] },
      status: { not: "IN_PROGRESS" },
    },
    select: {
      id: true,
      mode: true,
      examId: true,
      questionIds: true,
      startedAt: true,
      submittedAt: true,
      autoScore: true,
      timeLimitSec: true,
      items: {
        select: {
          questionId: true,
          answeredAt: true,
          selectedLetter: true,
          selfScore: true,
          question: { select: SCORED_QUESTION },
        },
      },
    },
  });
  if (!attempt) {
    return null;
  }
  const [ids, exam] = await Promise.all([
    questionIdsOf(attempt),
    attempt.examId
      ? prisma.exam.findUnique({ where: { id: attempt.examId }, select: { year: true } })
      : Promise.resolve(null),
  ]);
  return {
    ...attempt,
    year: exam?.year ?? null,
    totalQuestions: ids.length,
    summary: summarize(attempt.items),
  };
}
