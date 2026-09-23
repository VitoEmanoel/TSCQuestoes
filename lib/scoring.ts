export type ScoreSlot = { key: string; label: string; max: number };

export function slotsFor(
  valuePoints: number | null,
  standards: { subItem: string | null; maxScore: number | null }[],
): ScoreSlot[] {
  const withSubItems = standards.filter((standard) => standard.subItem !== null);
  if (withSubItems.length > 0 && withSubItems.every((standard) => standard.maxScore !== null)) {
    return withSubItems.map((standard) => ({
      key: standard.subItem!,
      label: `Item ${standard.subItem})`,
      max: standard.maxScore!,
    }));
  }
  const total =
    standards.length === 1 && standards[0].maxScore !== null
      ? standards[0].maxScore
      : (valuePoints ?? 10);
  return [{ key: "total", label: "Nota", max: total }];
}

export type ScorableItem = {
  questionId: string;
  type: "OBJECTIVE" | "DISCURSIVE";
  anulada: boolean;
  answeredAt: Date;
  selectedLetter: string | null;
  correctLetter: string | null;
  selfScore: number | null;
  maxPoints: number;
};

export type ScoreSummary = {
  objectives: { correct: number; counted: number; anuladas: number };
  discursives: {
    points: number;
    max: number;
    evaluated: number;
    unevaluated: number;
    anuladas: number;
  };
  percent: number | null;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function latestPerQuestion<T extends { questionId: string; answeredAt: Date }>(
  items: T[],
): T[] {
  const latest = new Map<string, T>();
  for (const item of items) {
    const current = latest.get(item.questionId);
    if (!current || item.answeredAt >= current.answeredAt) {
      latest.set(item.questionId, item);
    }
  }
  return [...latest.values()];
}

export function scoreItems(items: ScorableItem[]): ScoreSummary {
  const summary: ScoreSummary = {
    objectives: { correct: 0, counted: 0, anuladas: 0 },
    discursives: { points: 0, max: 0, evaluated: 0, unevaluated: 0, anuladas: 0 },
    percent: null,
  };
  for (const item of latestPerQuestion(items)) {
    if (item.type === "OBJECTIVE") {
      if (item.anulada) {
        summary.objectives.anuladas += 1;
        continue;
      }
      summary.objectives.counted += 1;
      if (item.correctLetter !== null && item.selectedLetter === item.correctLetter) {
        summary.objectives.correct += 1;
      }
      continue;
    }
    if (item.anulada) {
      summary.discursives.anuladas += 1;
      continue;
    }
    if (item.selfScore === null) {
      summary.discursives.unevaluated += 1;
      continue;
    }
    summary.discursives.evaluated += 1;
    summary.discursives.points += Math.min(Math.max(item.selfScore, 0), item.maxPoints);
    summary.discursives.max += item.maxPoints;
  }
  summary.discursives.points = round(summary.discursives.points);
  summary.discursives.max = round(summary.discursives.max);
  if (summary.objectives.counted > 0) {
    summary.percent = round((summary.objectives.correct / summary.objectives.counted) * 100);
  }
  return summary;
}

export type TopicRow = {
  topics: string[];
  type: "OBJECTIVE" | "DISCURSIVE";
  anulada: boolean;
  answered: boolean;
  correct: boolean;
  selfScore: number | null;
  maxPoints: number;
};

export type TopicPerformance = {
  topic: string;
  correct: number;
  wrong: number;
  blank: number;
  total: number;
  percent: number | null;
  discursive: { total: number; blank: number; pending: number; points: number; max: number };
};

export function topicPerformance(rows: TopicRow[]): TopicPerformance[] {
  const byTopic = new Map<string, TopicPerformance>();
  for (const row of rows) {
    if (row.anulada) {
      continue;
    }
    for (const topic of new Set(row.topics)) {
      const entry = byTopic.get(topic) ?? {
        topic,
        correct: 0,
        wrong: 0,
        blank: 0,
        total: 0,
        percent: null,
        discursive: { total: 0, blank: 0, pending: 0, points: 0, max: 0 },
      };
      if (row.type === "OBJECTIVE") {
        entry.total += 1;
        if (!row.answered) {
          entry.blank += 1;
        } else if (row.correct) {
          entry.correct += 1;
        } else {
          entry.wrong += 1;
        }
      } else {
        entry.discursive.total += 1;
        if (!row.answered) {
          entry.discursive.blank += 1;
        } else if (row.selfScore === null) {
          entry.discursive.pending += 1;
        } else {
          entry.discursive.points += Math.min(Math.max(row.selfScore, 0), row.maxPoints);
          entry.discursive.max += row.maxPoints;
        }
      }
      byTopic.set(topic, entry);
    }
  }
  const result = [...byTopic.values()].map((entry) => ({
    ...entry,
    percent: entry.total > 0 ? round((entry.correct / entry.total) * 100) : null,
    discursive: {
      ...entry.discursive,
      points: round(entry.discursive.points),
      max: round(entry.discursive.max),
    },
  }));
  return result.sort(
    (first, second) =>
      (first.percent ?? Number.POSITIVE_INFINITY) - (second.percent ?? Number.POSITIVE_INFINITY) ||
      second.total - first.total ||
      first.topic.localeCompare(second.topic, "pt-BR"),
  );
}
