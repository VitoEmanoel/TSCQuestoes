import "server-only";
import { openSimulados, scoreEvolution, topicHistory } from "@/lib/history";
import { prisma } from "@/lib/prisma";

const FOCUS_MIN_ANSWERS = 2;
const FOCUS_SIZE = 3;
const RECENT_SIZE = 4;

type Totals = { answered: number; objective: number; correct: number };

export async function studentDashboard(userId: string) {
  const [totalsRows, simulados, topics, evolution, open] = await Promise.all([
    prisma.$queryRaw<Totals[]>`
      SELECT
        COUNT(DISTINCT ai."questionId")::int AS answered,
        COUNT(*) FILTER (
          WHERE ai."selectedLetter" IS NOT NULL AND q.status = 'VALID'
        )::int AS objective,
        COUNT(*) FILTER (
          WHERE ai."selectedLetter" IS NOT NULL AND q.status = 'VALID' AND ai."selectedLetter" = o.letter
        )::int AS correct
      FROM "AttemptItem" ai
      JOIN "Attempt" a ON a.id = ai."attemptId"
      JOIN "Question" q ON q.id = ai."questionId"
      LEFT JOIN "Option" o ON o."questionId" = q.id AND o."isCorrect"
      WHERE a."userId" = ${userId}
        AND a.mode IN ('PRACTICE', 'FULL_EXAM', 'CUSTOM')
        AND ai."revealedAt" IS NOT NULL`,
    prisma.attempt.count({
      where: { userId, mode: { in: ["FULL_EXAM", "CUSTOM"] }, status: { not: "IN_PROGRESS" } },
    }),
    topicHistory(userId),
    scoreEvolution(userId),
    openSimulados(userId),
  ]);
  const totals = totalsRows[0] ?? { answered: 0, objective: 0, correct: 0 };
  const eligible = topics.filter((topic) => topic.total >= FOCUS_MIN_ANSWERS);
  return {
    answered: totals.answered,
    accuracy:
      totals.objective > 0 ? Math.round((totals.correct / totals.objective) * 1000) / 10 : null,
    objectiveAnswers: totals.objective,
    simulados,
    focus: (eligible.length > 0 ? eligible : topics).slice(0, FOCUS_SIZE),
    evolution,
    recent: [...evolution].reverse().slice(0, RECENT_SIZE),
    open: open[0] ?? null,
  };
}
