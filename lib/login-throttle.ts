import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ThrottlePolicy = {
  maxFailures: number;
  windowMs: number;
  baseLockMs: number;
  maxLockMs: number;
  lockMemoryMs: number;
};

export type ThrottleState = {
  failures: number;
  lockCount: number;
  windowStart: Date;
  lockedUntil: Date | null;
};

const MINUTE = 60_000;

export const EMAIL_POLICY: ThrottlePolicy = {
  maxFailures: 5,
  windowMs: 15 * MINUTE,
  baseLockMs: MINUTE,
  maxLockMs: 30 * MINUTE,
  lockMemoryMs: 24 * 60 * MINUTE,
};

export const IP_POLICY: ThrottlePolicy = {
  maxFailures: 50,
  windowMs: 15 * MINUTE,
  baseLockMs: 5 * MINUTE,
  maxLockMs: 60 * MINUTE,
  lockMemoryMs: 24 * 60 * MINUTE,
};

function limitFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1 && value <= 10_000 ? value : fallback;
}

export const SIGNUP_EMAIL_POLICY: ThrottlePolicy = {
  maxFailures: limitFromEnv("SIGNUP_EMAIL_LIMIT", 3),
  windowMs: 60 * MINUTE,
  baseLockMs: 60 * MINUTE,
  maxLockMs: 24 * 60 * MINUTE,
  lockMemoryMs: 24 * 60 * MINUTE,
};

export const SIGNUP_IP_POLICY: ThrottlePolicy = {
  maxFailures: limitFromEnv("SIGNUP_IP_LIMIT", 60),
  windowMs: 60 * MINUTE,
  baseLockMs: 60 * MINUTE,
  maxLockMs: 24 * 60 * MINUTE,
  lockMemoryMs: 24 * 60 * MINUTE,
};

export function isLocked(state: ThrottleState | null, now: Date): boolean {
  return Boolean(state?.lockedUntil && state.lockedUntil > now);
}

export function applyFailure(
  state: ThrottleState | null,
  now: Date,
  policy: ThrottlePolicy,
): ThrottleState {
  const current: ThrottleState = state ?? {
    failures: 0,
    lockCount: 0,
    windowStart: now,
    lockedUntil: null,
  };
  if (isLocked(current, now)) {
    return current;
  }
  const windowExpired = now.getTime() - current.windowStart.getTime() > policy.windowMs;
  const lockForgotten =
    current.lockedUntil !== null &&
    now.getTime() - current.lockedUntil.getTime() > policy.lockMemoryMs;
  const lockCount = lockForgotten ? 0 : current.lockCount;
  const failures = windowExpired ? 1 : current.failures + 1;
  const windowStart = windowExpired ? now : current.windowStart;

  if (failures < policy.maxFailures) {
    return { failures, lockCount, windowStart, lockedUntil: current.lockedUntil };
  }

  const nextLockCount = lockCount + 1;
  const lockMs = Math.min(policy.baseLockMs * 2 ** (nextLockCount - 1), policy.maxLockMs);
  return {
    failures: 0,
    lockCount: nextLockCount,
    windowStart: now,
    lockedUntil: new Date(now.getTime() + lockMs),
  };
}

export function throttleKey(
  kind: "email" | "ip" | "signup-email" | "signup-ip",
  value: string,
): string {
  return `${kind}:${createHash("sha256").update(value).digest("hex")}`;
}

export async function anyLocked(keys: string[], now = new Date()): Promise<boolean> {
  const rows = await prisma.loginThrottle.findMany({
    where: { key: { in: keys }, lockedUntil: { gt: now } },
    select: { key: true },
  });
  return rows.length > 0;
}

export async function recordFailure(
  key: string,
  policy: ThrottlePolicy,
  now = new Date(),
): Promise<ThrottleState> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "LoginThrottle" ("key", "updatedAt") VALUES (${key}, ${now}) ON CONFLICT ("key") DO NOTHING`;
    const [row] = await tx.$queryRaw<
      ThrottleState[]
    >`SELECT "failures", "lockCount", "windowStart", "lockedUntil" FROM "LoginThrottle" WHERE "key" = ${key} FOR UPDATE`;
    const next = applyFailure(row ?? null, now, policy);
    await tx.loginThrottle.update({ where: { key }, data: next });
    return next;
  });
}

export async function clearThrottle(key: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key } });
}

export function clientIp(headers: Headers): string {
  const configured = process.env.CLIENT_IP_HEADER?.toLowerCase();
  if (configured) {
    const value = headers.get(configured)?.split(",")[0]?.trim();
    if (value) {
      return value;
    }
  }
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || "desconhecido";
}
