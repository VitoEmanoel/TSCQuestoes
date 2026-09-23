import "server-only";
import type { Prisma } from "@prisma/client";
import { SCORED_QUESTION, summarize } from "@/lib/attempt-score";
import { prisma } from "@/lib/prisma";

export const MAX_SIMULADO_ANSWER_LENGTH = 5000;

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

export async function startReplay(userId: string, examId: string): Promise<string | null> {
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
  if (!exam) {
    return null;
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`simulado:${userId}`}))`;
    const open = await tx.attempt.findFirst({
      where: { userId, mode: "FULL_EXAM", status: "IN_PROGRESS", examId },
      select: { id: true },
    });
    if (open) {
      return open.id;
    }
    const created = await tx.attempt.create({
      data: { userId, mode: "FULL_EXAM", examId, revealPolicy: "AT_END" },
      select: { id: true },
    });
    return created.id;
  });
}

async function ownedSimulado(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId, mode: "FULL_EXAM" },
    select: { id: true, examId: true, status: true, startedAt: true, submittedAt: true },
  });
  if (!attempt?.examId) {
    return null;
  }
  return { ...attempt, examId: attempt.examId };
}

export async function simuladoOverview(userId: string, attemptId: string) {
  const attempt = await ownedSimulado(userId, attemptId);
  if (!attempt) {
    return null;
  }
  const [exam, items] = await Promise.all([
    prisma.exam.findUniqueOrThrow({
      where: { id: attempt.examId },
      select: {
        year: true,
        questions: {
          orderBy: { order: "asc" },
          select: { id: true, originalLabel: true, type: true, status: true },
        },
      },
    }),
    prisma.attemptItem.findMany({
      where: { attemptId: attempt.id },
      select: { questionId: true, selectedLetter: true, answerText: true, answeredAt: true },
    }),
  ]);
  const answers = new Map(items.map((item) => [item.questionId, item]));
  return {
    attempt,
    year: exam.year,
    questions: exam.questions.map((question) => ({
      ...question,
      answer: answers.get(question.id) ?? null,
    })),
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

type LockedAttempt = { examId: string | null; status: string };

async function lockOwnedAttempt(
  tx: Prisma.TransactionClient,
  userId: string,
  attemptId: string,
): Promise<LockedAttempt | null> {
  const rows = await tx.$queryRaw<LockedAttempt[]>`
    SELECT "examId", status::text AS status FROM "Attempt"
    WHERE id = ${attemptId} AND "userId" = ${userId} AND mode = 'FULL_EXAM'
    FOR UPDATE`;
  return rows[0] ?? null;
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
    if (!attempt?.examId) {
      return "invalid";
    }
    if (attempt.status !== "IN_PROGRESS") {
      return "closed";
    }
    const question = await tx.question.findFirst({
      where: { id: questionId, examId: attempt.examId },
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
    if (!attempt?.examId) {
      return "invalid";
    }
    if (attempt.status !== "IN_PROGRESS") {
      return "closed";
    }
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
      data: { status: "SUBMITTED", submittedAt: now, autoScore: summarize(items).percent },
    });
    return "ok";
  });
}

export async function simuladoResult(userId: string, attemptId: string) {
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, userId, mode: "FULL_EXAM", status: { not: "IN_PROGRESS" } },
    select: {
      id: true,
      examId: true,
      startedAt: true,
      submittedAt: true,
      autoScore: true,
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
  if (!attempt?.examId) {
    return null;
  }
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: attempt.examId },
    select: { year: true, _count: { select: { questions: true } } },
  });
  return {
    ...attempt,
    year: exam.year,
    totalQuestions: exam._count.questions,
    summary: summarize(attempt.items),
  };
}
