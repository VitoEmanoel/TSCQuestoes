import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PROTECTED_TOPICS = new Set(["Formação Geral"]);
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ,.()/&–-]*$/u;

export function normalizeTopicName(raw: string): string | null {
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 60 && NAME_PATTERN.test(name) ? name : null;
}

export async function topicsWithUsage() {
  const topics = await prisma.topic.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      category: true,
      questions: { select: { question: { select: { publishedAt: true } } } },
    },
  });
  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    category: topic.category,
    total: topic.questions.length,
    published: topic.questions.filter((tag) => tag.question.publishedAt !== null).length,
    protected: PROTECTED_TOPICS.has(topic.name),
  }));
}

async function nameTaken(name: string, exceptId?: string): Promise<boolean> {
  const clash = await prisma.topic.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return clash !== null;
}

export type TopicOutcome = "ok" | "duplicate" | "protected" | "used" | "missing";

export async function createTopic(name: string, category: string | null): Promise<TopicOutcome> {
  if (await nameTaken(name)) {
    return "duplicate";
  }
  try {
    await prisma.topic.create({ data: { name, category } });
    return "ok";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "duplicate";
    }
    throw error;
  }
}

export async function renameTopic(id: string, name: string): Promise<TopicOutcome> {
  const topic = await prisma.topic.findUnique({ where: { id }, select: { name: true } });
  if (!topic) {
    return "missing";
  }
  if (PROTECTED_TOPICS.has(topic.name) || PROTECTED_TOPICS.has(name)) {
    return "protected";
  }
  if (await nameTaken(name, id)) {
    return "duplicate";
  }
  try {
    await prisma.topic.update({ where: { id }, data: { name } });
    return "ok";
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return "duplicate";
    }
    throw error;
  }
}

export async function deleteTopic(id: string): Promise<TopicOutcome> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ name: string }[]>`
      SELECT name FROM "Topic" WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) {
      return "missing";
    }
    if (PROTECTED_TOPICS.has(rows[0].name)) {
      return "protected";
    }
    if ((await tx.questionTag.count({ where: { topicId: id } })) > 0) {
      return "used";
    }
    await tx.topic.delete({ where: { id } });
    return "ok";
  });
}
