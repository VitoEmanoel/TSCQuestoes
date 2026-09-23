import "server-only";
import { prisma } from "@/lib/prisma";
import { scoreItems, slotsFor } from "@/lib/scoring";

export const SCORED_QUESTION = {
  id: true,
  originalLabel: true,
  type: true,
  status: true,
  valuePoints: true,
  exam: { select: { year: true } },
  options: { where: { isCorrect: true }, select: { letter: true } },
  answerStandards: { select: { subItem: true, maxScore: true } },
} as const;

type ScoredRow = {
  questionId: string;
  answeredAt: Date;
  selectedLetter: string | null;
  selfScore: number | null;
  question: {
    type: "OBJECTIVE" | "DISCURSIVE";
    status: "VALID" | "ANULADA";
    valuePoints: number | null;
    options: { letter: string }[];
    answerStandards: { subItem: string | null; maxScore: number | null }[];
  };
};

export function summarize(rows: ScoredRow[]) {
  return scoreItems(
    rows.map((row) => ({
      questionId: row.questionId,
      type: row.question.type,
      anulada: row.question.status === "ANULADA",
      answeredAt: row.answeredAt,
      selectedLetter: row.selectedLetter,
      correctLetter: row.question.options[0]?.letter ?? null,
      selfScore: row.selfScore,
      maxPoints: slotsFor(row.question.valuePoints, row.question.answerStandards).reduce(
        (sum, slot) => sum + slot.max,
        0,
      ),
    })),
  );
}

export async function scoreAttempt(attemptId: string) {
  const rows = await prisma.attemptItem.findMany({
    where: { attemptId },
    select: {
      questionId: true,
      answeredAt: true,
      selectedLetter: true,
      selfScore: true,
      question: { select: SCORED_QUESTION },
    },
  });
  return summarize(rows);
}
