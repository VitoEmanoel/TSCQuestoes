import { readdirSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { listYears, loadDrafts, validateYears } from "../scripts/extract/validate";

const COURSE = "Tecnologia em Análise e Desenvolvimento de Sistemas";
const PROVAS_ROOT = join(process.cwd(), "ProvasEnadeADS");

const TOPICS: Array<{ name: string; category: string }> = [
  { name: "Formação Geral", category: "Formação Geral" },
  { name: "Engenharia de Software", category: "Componente Específico" },
  { name: "Banco de Dados", category: "Componente Específico" },
  { name: "Estrutura de Dados e Algoritmos", category: "Componente Específico" },
  { name: "Programação", category: "Componente Específico" },
  { name: "Redes de Computadores", category: "Componente Específico" },
  { name: "Sistemas Operacionais", category: "Componente Específico" },
  { name: "Matemática e Lógica", category: "Componente Específico" },
  { name: "Governança e Gestão de TI", category: "Componente Específico" },
  { name: "Qualidade de Software", category: "Componente Específico" },
];

async function seedTopicsAndAdmin() {
  for (const topic of TOPICS) {
    await prisma.topic.upsert({
      where: { name: topic.name },
      update: {},
      create: topic,
    });
  }

  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.allow_admin', 'on', true)`;
    await tx.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        name: "Administrador",
        role: "ADMIN",
        passwordHash,
      },
    });
  });

  console.log(`Admin ok: ${adminEmail} / ${adminPassword}`);
}

function findPdfFile(year: string, tipo: string): string | null {
  const dir = join(PROVAS_ROOT, year, tipo);
  const file = readdirSync(dir).find((name) => name.toLowerCase().endsWith(".pdf"));
  return file ?? null;
}

async function seedExam(year: string) {
  const yearNumber = Number(year);

  const exam = await prisma.exam.upsert({
    where: { year_course: { year: yearNumber, course: COURSE } },
    update: {
      sourceProvaFile: findPdfFile(year, "prova"),
      sourceGabaritoFile: findPdfFile(year, "gabarito"),
      sourcePadraoFile: findPdfFile(year, "padraoresposta"),
    },
    create: {
      year: yearNumber,
      course: COURSE,
      sourceProvaFile: findPdfFile(year, "prova"),
      sourceGabaritoFile: findPdfFile(year, "gabarito"),
      sourcePadraoFile: findPdfFile(year, "padraoresposta"),
    },
  });

  let created = 0;
  let kept = 0;

  const topicIds = new Map(
    (await prisma.topic.findMany({ select: { id: true, name: true } })).map((topic) => [
      topic.name,
      topic.id,
    ]),
  );

  for (const { draft } of loadDrafts(year)) {
    const existing = await prisma.question.findUnique({
      where: { examId_originalLabel: { examId: exam.id, originalLabel: draft.originalLabel } },
      select: { id: true },
    });
    if (existing) {
      kept += 1;
      continue;
    }
    const missingTag = draft.tags.find((tagName) => !topicIds.has(tagName));
    if (missingTag) {
      throw new Error(
        `Tag "${missingTag}" (questão ${year}/${draft.originalLabel}) não existe em Topic`,
      );
    }

    await prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          examId: exam.id,
          originalLabel: draft.originalLabel,
          order: draft.order,
          type: draft.type,
          area: draft.area,
          status: draft.status,
          statementMd: draft.statementMd,
          valuePoints: draft.valuePoints,
          sourcePage: draft.sourcePage,
          publishedAt: new Date(),
          reviewedAt: new Date(),
        },
        select: { id: true },
      });

      if (draft.options.length > 0) {
        await tx.option.createMany({
          data: draft.options.map((option) => ({
            questionId: question.id,
            letter: option.letter,
            textMd: option.textMd,
            isCorrect: option.isCorrect,
          })),
        });
      }

      for (const answerStandard of draft.answerStandards) {
        const standard = await tx.answerStandard.create({
          data: {
            questionId: question.id,
            subItem: answerStandard.subItem,
            criteriaMd: answerStandard.criteriaMd,
            maxScore: answerStandard.maxScore,
          },
          select: { id: true },
        });
        for (const asset of answerStandard.assets) {
          await tx.asset.create({
            data: {
              questionId: question.id,
              answerStandardId: standard.id,
              kind: asset.kind,
              filePath: asset.filePath,
              caption: asset.caption,
            },
          });
        }
      }

      for (const asset of draft.assets) {
        await tx.asset.create({
          data: {
            questionId: question.id,
            kind: asset.kind,
            filePath: asset.filePath,
            caption: asset.caption,
          },
        });
      }

      await tx.questionTag.createMany({
        data: draft.tags.map((tagName) => ({
          questionId: question.id,
          topicId: topicIds.get(tagName)!,
        })),
      });
    });

    created += 1;
  }

  console.log(
    `Exame ${year}: ${created} questão(ões) criada(s), ${kept} já existia(m) e não foi(ram) alterada(s).`,
  );
}

async function main() {
  await seedTopicsAndAdmin();

  const years = listYears();
  const issues = validateYears(years);
  const errors = issues.filter((issue) => issue.level === "error");

  if (errors.length > 0) {
    for (const issue of errors) {
      console.error(`[ERRO] ${issue.file}: ${issue.message}`);
    }
    throw new Error(
      `${errors.length} erro(s) de validação encontrados — rode "npm run extract:validate" e corrija antes de seedar.`,
    );
  }

  for (const year of years) {
    await seedExam(year);
  }

  console.log("Seed concluído.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
