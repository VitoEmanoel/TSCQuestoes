import "server-only";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const USER_SEARCH_MAX = 100;
const RECENT_DAYS = 7;

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: Date;
  signIn: "google" | "senha";
  answered: number;
  simulados: number;
  lastActivity: Date | null;
};

export type AdminUserSummary = {
  students: number;
  newRecently: number;
  activeRecently: number;
  recentDays: number;
};

type Activity = { userId: string; answered: number; lastAnswer: Date | null };

export function normalizeUserSearch(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, USER_SEARCH_MAX) : "";
}

function latest(...dates: (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((date): date is Date => date instanceof Date);
  return valid.length === 0
    ? null
    : valid.reduce((max, date) => (date > max ? date : max), valid[0]);
}

export async function adminUsers(search: string): Promise<{
  rows: AdminUserRow[];
  summary: AdminUserSummary;
}> {
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { name: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

  const [users, attempts, simulados, activity, students, newRecently] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        passwordHash: true,
      },
    }),
    prisma.attempt.groupBy({ by: ["userId"], _max: { startedAt: true } }),
    prisma.attempt.groupBy({
      by: ["userId"],
      where: { mode: { in: ["FULL_EXAM", "CUSTOM"] }, status: { not: "IN_PROGRESS" } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Activity[]>`
      SELECT a."userId" AS "userId",
             COUNT(DISTINCT ai."questionId")::int AS "answered",
             MAX(ai."answeredAt") AS "lastAnswer"
      FROM "AttemptItem" ai
      JOIN "Attempt" a ON a.id = ai."attemptId"
      GROUP BY a."userId"`,
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "STUDENT", createdAt: { gte: since } } }),
  ]);

  const lastStart = new Map(attempts.map((row) => [row.userId, row._max.startedAt]));
  const finished = new Map(simulados.map((row) => [row.userId, row._count._all]));
  const answers = new Map(activity.map((row) => [row.userId, row]));

  const rows = users.map((user) => {
    const answered = answers.get(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      signIn: user.passwordHash ? ("senha" as const) : ("google" as const),
      answered: answered?.answered ?? 0,
      simulados: finished.get(user.id) ?? 0,
      lastActivity: latest(lastStart.get(user.id), answered?.lastAnswer),
    };
  });

  const activeRecently = new Set(
    [...lastStart.entries(), ...activity.map((row) => [row.userId, row.lastAnswer] as const)]
      .filter(([, date]) => date instanceof Date && date >= since)
      .map(([userId]) => userId),
  );
  const studentIds = new Set(
    (
      await prisma.user.findMany({
        where: { role: "STUDENT", id: { in: [...activeRecently] } },
        select: { id: true },
      })
    ).map((user) => user.id),
  );

  return {
    rows,
    summary: {
      students,
      newRecently,
      activeRecently: studentIds.size,
      recentDays: RECENT_DAYS,
    },
  };
}
