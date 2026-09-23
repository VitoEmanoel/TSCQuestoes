import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type Trend, trendOf } from "@/lib/scoring";

export const HISTORY_PAGE_SIZE = 20;
const EVOLUTION_SIZE = 10;

const FINISHED: Prisma.AttemptWhereInput = {
  status: { not: "IN_PROGRESS" },
  OR: [{ mode: { in: ["FULL_EXAM", "CUSTOM"] } }, { mode: "PRACTICE", items: { some: {} } }],
};

export async function historyPage(userId: string, requestedPage: number) {
  const where = { userId, ...FINISHED };
  const total = await prisma.attempt.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const attempts = await prisma.attempt.findMany({
    where,
    orderBy: [{ submittedAt: "desc" }, { startedAt: "desc" }],
    skip: (page - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
    select: {
      id: true,
      mode: true,
      examId: true,
      questionIds: true,
      startedAt: true,
      submittedAt: true,
      autoScore: true,
      timeLimitSec: true,
      _count: { select: { items: true } },
    },
  });
  const examIds = [...new Set(attempts.flatMap((attempt) => attempt.examId ?? []))];
  const exams = await prisma.exam.findMany({
    where: { id: { in: examIds } },
    select: { id: true, year: true },
  });
  const yearOf = new Map(exams.map((exam) => [exam.id, exam.year]));
  return {
    total,
    page,
    pageCount,
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      mode: attempt.mode,
      year: attempt.examId ? (yearOf.get(attempt.examId) ?? null) : null,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      autoScore: attempt.autoScore,
      timeLimitSec: attempt.timeLimitSec,
      answered: attempt._count.items,
      total: attempt.mode === "PRACTICE" ? attempt._count.items : attempt.questionIds.length,
    })),
  };
}

export async function openSimulados(userId: string) {
  const attempts = await prisma.attempt.findMany({
    where: { userId, mode: { in: ["FULL_EXAM", "CUSTOM"] }, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      examId: true,
      startedAt: true,
      questionIds: true,
      _count: { select: { items: true } },
    },
  });
  const exams = await prisma.exam.findMany({
    where: { id: { in: attempts.flatMap((attempt) => attempt.examId ?? []) } },
    select: { id: true, year: true },
  });
  const yearOf = new Map(exams.map((exam) => [exam.id, exam.year]));
  return attempts.map((attempt) => ({
    id: attempt.id,
    year: attempt.examId ? (yearOf.get(attempt.examId) ?? null) : null,
    startedAt: attempt.startedAt,
    answered: attempt._count.items,
    total: attempt.questionIds.length,
  }));
}

export async function scoreEvolution(userId: string) {
  const attempts = await prisma.attempt.findMany({
    where: {
      userId,
      mode: { in: ["FULL_EXAM", "CUSTOM"] },
      status: { not: "IN_PROGRESS" },
      autoScore: { not: null },
    },
    orderBy: { submittedAt: "desc" },
    take: EVOLUTION_SIZE,
    select: { id: true, mode: true, examId: true, submittedAt: true, autoScore: true },
  });
  const exams = await prisma.exam.findMany({
    where: { id: { in: attempts.flatMap((attempt) => attempt.examId ?? []) } },
    select: { id: true, year: true },
  });
  const yearOf = new Map(exams.map((exam) => [exam.id, exam.year]));
  return attempts.reverse().map((attempt) => ({
    id: attempt.id,
    year: attempt.examId ? (yearOf.get(attempt.examId) ?? null) : null,
    submittedAt: attempt.submittedAt,
    score: attempt.autoScore ?? 0,
  }));
}

type TopicRowRaw = {
  topic: string;
  total: number;
  correct: number;
  older_total: number;
  older_correct: number;
  newer_total: number;
  newer_correct: number;
};

export type TopicHistory = {
  topic: string;
  total: number;
  correct: number;
  percent: number;
  trend: Trend;
};

export async function topicHistory(userId: string): Promise<TopicHistory[]> {
  const rows = await prisma.$queryRaw<TopicRowRaw[]>`
    WITH answers AS (
      SELECT t.name AS topic, ai."answeredAt", (ai."selectedLetter" = o.letter) AS correct
      FROM "AttemptItem" ai
      JOIN "Attempt" a ON a.id = ai."attemptId"
      JOIN "Question" q ON q.id = ai."questionId"
      JOIN "Option" o ON o."questionId" = q.id AND o."isCorrect"
      JOIN "QuestionTag" qt ON qt."questionId" = q.id
      JOIN "Topic" t ON t.id = qt."topicId"
      WHERE a."userId" = ${userId}
        AND a.mode IN ('PRACTICE', 'FULL_EXAM', 'CUSTOM')
        AND ai."selectedLetter" IS NOT NULL
        AND ai."revealedAt" IS NOT NULL
        AND q.status = 'VALID'
    ),
    ranked AS (
      SELECT topic, correct,
        ROW_NUMBER() OVER (PARTITION BY topic ORDER BY "answeredAt") AS rn,
        COUNT(*) OVER (PARTITION BY topic) AS cnt
      FROM answers
    )
    SELECT topic,
      COUNT(*)::int AS total,
      SUM(correct::int)::int AS correct,
      SUM(CASE WHEN rn <= cnt / 2 THEN 1 ELSE 0 END)::int AS older_total,
      SUM(CASE WHEN rn <= cnt / 2 THEN correct::int ELSE 0 END)::int AS older_correct,
      SUM(CASE WHEN rn > cnt / 2 THEN 1 ELSE 0 END)::int AS newer_total,
      SUM(CASE WHEN rn > cnt / 2 THEN correct::int ELSE 0 END)::int AS newer_correct
    FROM ranked
    GROUP BY topic`;
  return rows
    .map((row) => ({
      topic: row.topic,
      total: row.total,
      correct: row.correct,
      percent: Math.round((row.correct / row.total) * 10000) / 100,
      trend: trendOf(
        { correct: row.older_correct, total: row.older_total },
        { correct: row.newer_correct, total: row.newer_total },
      ),
    }))
    .sort(
      (first, second) =>
        first.percent - second.percent ||
        second.total - first.total ||
        first.topic.localeCompare(second.topic, "pt-BR"),
    );
}
