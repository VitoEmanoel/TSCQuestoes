import { copyFileSync, constants, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  CONTENT_FILE,
  CONTENT_FORMAT,
  type ContentBundle,
  UPLOADS_DIR,
  UPLOAD_NAME,
  uploadFileOf,
} from "./content-format";

const DATE_FIELDS = ["publishedAt", "reviewedAt", "createdAt", "updatedAt"];

function revive<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const field of DATE_FIELDS) {
      if (typeof copy[field] === "string") {
        copy[field] = new Date(copy[field] as string);
      }
    }
    return copy as T;
  });
}

function readBundle(dir: string): ContentBundle {
  const bundle = JSON.parse(readFileSync(join(dir, CONTENT_FILE), "utf-8")) as ContentBundle;
  if (bundle.formato !== CONTENT_FORMAT) {
    throw new Error(`Formato do arquivo de conteúdo desconhecido: ${bundle.formato}`);
  }
  const referenced = new Set(
    bundle.assets.map((asset) => uploadFileOf(asset.filePath)).filter(Boolean),
  );
  for (const name of bundle.uploads) {
    if (!UPLOAD_NAME.test(name) || !referenced.has(name)) {
      throw new Error(`Nome de imagem inesperado no pacote: ${name}`);
    }
    if (!existsSync(join(dir, UPLOADS_DIR, name))) {
      throw new Error(`Imagem ${name} está na lista mas não veio no pacote.`);
    }
  }
  if (referenced.size !== bundle.uploads.length) {
    throw new Error("Há imagem enviada citada no conteúdo que não está no pacote.");
  }
  return bundle;
}

async function main() {
  const dir = resolve(process.argv[2] ?? "conteudo");
  const uploadRoot = process.env.UPLOAD_DIR;
  if (!uploadRoot) {
    throw new Error("Defina UPLOAD_DIR (pasta das imagens enviadas no servidor).");
  }
  const bundle = readBundle(dir);
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.exam.count();
    if (existing > 0) {
      throw new Error(
        `O banco já tem ${existing} prova(s). A carga inicial só roda em banco vazio, para não sobrescrever nada.`,
      );
    }

    mkdirSync(uploadRoot, { recursive: true });
    for (const name of bundle.uploads) {
      const target = join(uploadRoot, name);
      if (!existsSync(target)) {
        copyFileSync(join(dir, UPLOADS_DIR, name), target, constants.COPYFILE_EXCL);
      }
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.exam.createMany({ data: revive(bundle.exams) as Prisma.ExamCreateManyInput[] });
        await tx.topic.createMany({ data: revive(bundle.topics) as Prisma.TopicCreateManyInput[] });
        await tx.question.createMany({
          data: revive(bundle.questions) as Prisma.QuestionCreateManyInput[],
        });
        await tx.option.createMany({
          data: revive(bundle.options) as Prisma.OptionCreateManyInput[],
        });
        await tx.answerStandard.createMany({
          data: revive(bundle.standards) as Prisma.AnswerStandardCreateManyInput[],
        });
        await tx.asset.createMany({ data: revive(bundle.assets) as Prisma.AssetCreateManyInput[] });
        await tx.questionTag.createMany({
          data: revive(bundle.tags) as Prisma.QuestionTagCreateManyInput[],
        });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );

    const [exams, questions, assets] = await Promise.all([
      prisma.exam.count(),
      prisma.question.count(),
      prisma.asset.count(),
    ]);
    if (
      exams !== bundle.exams.length ||
      questions !== bundle.questions.length ||
      assets !== bundle.assets.length
    ) {
      throw new Error("A contagem depois da carga não bate com o pacote.");
    }
    console.log(
      `Carga concluída: ${exams} provas, ${questions} questões, ${assets} imagens ` +
        `(${bundle.uploads.length} copiadas para ${uploadRoot}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
