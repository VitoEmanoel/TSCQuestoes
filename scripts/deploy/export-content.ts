import "dotenv/config";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  CONTENT_FILE,
  CONTENT_FORMAT,
  type ContentBundle,
  UPLOADS_DIR,
  uploadFileOf,
} from "./content-format";

const OUT = resolve(process.argv[2] ?? join("release", "conteudo"));
const SOURCE_UPLOADS = process.env.UPLOAD_DIR || join(process.cwd(), "storage", "uploads");

async function main() {
  const prisma = new PrismaClient();
  try {
    const [exams, topics, questions, options, standards, assets, tags] = await Promise.all([
      prisma.exam.findMany({ orderBy: { year: "asc" } }),
      prisma.topic.findMany({ orderBy: { name: "asc" } }),
      prisma.question.findMany({ orderBy: [{ examId: "asc" }, { order: "asc" }] }),
      prisma.option.findMany({ orderBy: [{ questionId: "asc" }, { letter: "asc" }] }),
      prisma.answerStandard.findMany({ orderBy: { questionId: "asc" } }),
      prisma.asset.findMany({ orderBy: [{ questionId: "asc" }, { position: "asc" }] }),
      prisma.questionTag.findMany(),
    ]);

    const uploads = [...new Set(assets.map((asset) => uploadFileOf(asset.filePath)))].filter(
      (name): name is string => name !== null,
    );
    const missing = uploads.filter((name) => !existsSync(join(SOURCE_UPLOADS, name)));
    if (missing.length > 0) {
      throw new Error(`Imagens enviadas que faltam no disco: ${missing.join(", ")}`);
    }

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(join(OUT, UPLOADS_DIR), { recursive: true });
    for (const name of uploads) {
      copyFileSync(join(SOURCE_UPLOADS, name), join(OUT, UPLOADS_DIR, name));
    }

    const bundle: ContentBundle = {
      formato: CONTENT_FORMAT,
      geradoEm: new Date().toISOString(),
      exams,
      topics,
      questions,
      options,
      standards,
      assets,
      tags,
      uploads,
    };
    writeFileSync(join(OUT, CONTENT_FILE), JSON.stringify(bundle));

    console.log(
      `Conteúdo exportado para ${OUT}: ${exams.length} provas, ${questions.length} questões, ` +
        `${options.length} alternativas, ${standards.length} padrões, ${topics.length} temas, ` +
        `${assets.length} imagens (${uploads.length} enviadas pelo painel).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
