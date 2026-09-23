import "dotenv/config";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { QuestionDraft } from "../extract/parsers/types";
import { loadDrafts } from "../extract/validate";

const YEAR = process.argv[2] ?? "2021";
const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const E2E_DB = "tscquestoes_e2e";
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local";
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "admin123";
const STUDENT_EMAIL = "aluno-e2e@teste.local";
const STUDENT_PASSWORD = "senhaDoAlunoE2e1";

const mainUrl = process.env.DATABASE_URL ?? "";
const e2eUrl = mainUrl.replace(/\/([^/?]+)(\?|$)/, `/${E2E_DB}$2`);
const results: { step: string; ok: boolean; detail: string }[] = [];

function step(name: string, ok: boolean, detail = "") {
  results.push({ step: name, ok, detail });
  console.log(`${ok ? "OK    " : "FALHOU"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function decode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function text(html: string): string {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

class Browser {
  cookies = new Map<string, string>();

  async request(path: string, init: RequestInit = {}, origin = false) {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set("cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    }
    if (origin) {
      headers.set("origin", BASE);
      headers.set("sec-fetch-site", "same-origin");
    }
    const response = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const value = pair.slice(index + 1).trim();
      if (value === "" || /max-age=0/i.test(raw)) {
        this.cookies.delete(pair.slice(0, index).trim());
      } else {
        this.cookies.set(pair.slice(0, index).trim(), value);
      }
    }
    return {
      status: response.status,
      location: response.headers.get("location") ?? "",
      body: await response.text(),
    };
  }

  async form(path: string, marker: string): Promise<Record<string, string>> {
    const page = await this.request(path);
    const form = [...page.body.matchAll(/<form\b[\s\S]*?<\/form>/g)]
      .map((match) => match[0])
      .find((candidate) => candidate.includes(marker));
    const fields: Record<string, string> = {};
    for (const match of (form ?? "").matchAll(
      /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
    )) {
      fields[decode(match[1])] = decode(match[2] ?? "");
    }
    return fields;
  }

  post(path: string, entries: [string, string | Blob, string?][]) {
    const data = new FormData();
    for (const [key, value, filename] of entries) {
      if (value instanceof Blob) {
        data.append(key, value, filename);
      } else {
        data.append(key, value);
      }
    }
    return this.request(path, { method: "POST", body: data }, true);
  }

  async login(email: string, password: string) {
    const hidden = await this.form("/login", 'name="password"');
    return this.post("/login", [
      ...Object.entries(hidden),
      ["email", email],
      ["password", password],
      ["callbackUrl", "/"],
    ]);
  }
}

function words(value: string): string[] {
  return value.toLowerCase().normalize("NFC").split(/\s+/).filter(Boolean);
}

function similarity(first: string, second: string): number {
  const counts = new Map<string, number>();
  for (const word of words(first)) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  const secondWords = words(second);
  for (const word of secondWords) {
    const left = counts.get(word) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(word, left - 1);
    }
  }
  const total = Math.max(words(first).length, secondWords.length);
  return total === 0 ? 1 : shared / total;
}

function sameText(first: string, second: string): boolean {
  return first.replace(/\s+/g, " ").trim() === second.replace(/\s+/g, " ").trim();
}

async function waitForServer(): Promise<boolean> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${BASE}/login`).catch(() => null);
    if (response?.status === 200) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  if (!mainUrl || e2eUrl === mainUrl) {
    throw new Error("DATABASE_URL não permite derivar o banco de teste.");
  }
  const root = new PrismaClient({ datasourceUrl: mainUrl });
  await root.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${E2E_DB}" WITH (FORCE)`);
  await root.$executeRawUnsafe(`CREATE DATABASE "${E2E_DB}"`);
  await root.$disconnect();
  const env = { ...process.env, DATABASE_URL: e2eUrl };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "ignore" });
  execFileSync("npx", ["prisma", "db", "seed"], { env, stdio: "ignore" });

  const db = new PrismaClient({ datasourceUrl: e2eUrl });
  const uploadDir = mkdtempSync(join(tmpdir(), "tscq-e2e-uploads-"));
  let server: ChildProcess | null = null;
  try {
    const seeded = await db.exam.findFirstOrThrow({ where: { year: Number(YEAR) } });
    await db.option.deleteMany({ where: { question: { examId: seeded.id } } });
    await db.asset.deleteMany({ where: { question: { examId: seeded.id } } });
    await db.answerStandard.deleteMany({ where: { question: { examId: seeded.id } } });
    await db.questionTag.deleteMany({ where: { question: { examId: seeded.id } } });
    await db.question.deleteMany({ where: { examId: seeded.id } });
    await db.exam.delete({ where: { id: seeded.id } });
    step(
      `banco de teste montado sem a prova de ${YEAR}`,
      true,
      `${await db.question.count()} questões das outras provas`,
    );

    server = spawn("npx", ["next", "start", "-p", String(PORT)], {
      env: { ...env, AUTH_URL: BASE, UPLOAD_DIR: uploadDir },
      stdio: "ignore",
    });
    step("sistema de teste no ar", await waitForServer(), BASE);

    const reference = new Map<string, QuestionDraft>(
      loadDrafts(YEAR).map(({ draft }) => [draft.originalLabel, draft]),
    );
    const raw = (name: string) =>
      readFileSync(join(process.cwd(), "scripts/extract/raw", YEAR, `${name}.txt`), "utf-8");
    const admin = new Browser();
    const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    step("admin entra pelo formulário de login", login.status === 303, login.location);

    const importHidden = await admin.form("/admin/provas/nova", 'name="etapa"');
    const importEntries = (stage: string): [string, string][] => [
      ...Object.entries(importHidden),
      ["etapa", stage],
      ["ano", YEAR],
      ["curso", "Tecnologia em Análise e Desenvolvimento de Sistemas"],
      ["prova", raw("prova")],
      ["gabarito", raw("gabarito")],
      ["padrao", raw("padraoresposta")],
    ];
    const analysis = await admin.post("/admin/provas/nova", importEntries("analisar"));
    const analysisText = text(analysis.body);
    step(
      "“Analisar” com o texto real da prova",
      analysisText.includes(`${reference.size} questões encontradas`) &&
        (await db.exam.count({ where: { year: Number(YEAR) } })) === 0,
      analysisText.match(/\d+ questões encontradas[^.]*\.[^.]*\./)?.[0] ?? "",
    );
    const created = await admin.post("/admin/provas/nova", importEntries("criar"));
    const exam = await db.exam.findFirst({ where: { year: Number(YEAR) }, select: { id: true } });
    step(
      "“Criar” grava a prova como rascunho",
      Boolean(exam) && created.location.includes("importada=1"),
      created.location,
    );
    if (!exam) return;

    const imported = await db.question.findMany({
      where: { examId: exam.id },
      orderBy: { order: "asc" },
      include: {
        options: { orderBy: { letter: "asc" } },
        answerStandards: { orderBy: [{ subItem: "asc" }, { id: "asc" }] },
      },
    });
    const byLabel = new Map(imported.map((question) => [question.originalLabel, question]));
    let labels = 0;
    let types = 0;
    let keys = 0;
    let optionsExact = 0;
    let objectives = 0;
    let standardsShape = 0;
    let discursives = 0;
    const similarities: number[] = [];
    for (const [label, draft] of reference) {
      const question = byLabel.get(label);
      if (!question) continue;
      labels += 1;
      if (question.type === draft.type && question.order === draft.order) types += 1;
      similarities.push(similarity(question.statementMd, draft.statementMd));
      if (draft.type === "OBJECTIVE") {
        objectives += 1;
        const correct = question.options.find((option) => option.isCorrect)?.letter ?? null;
        const expected = draft.options.find((option) => option.isCorrect)?.letter ?? null;
        if (correct === expected && question.status === draft.status) keys += 1;
        if (
          draft.options.every((option, index) =>
            sameText(option.textMd, question.options[index]?.textMd ?? ""),
          )
        )
          optionsExact += 1;
      } else {
        discursives += 1;
        if (
          question.answerStandards.length === draft.answerStandards.length &&
          draft.answerStandards.every(
            (standard, index) =>
              question.answerStandards[index]?.subItem === standard.subItem &&
              question.answerStandards[index]?.maxScore === standard.maxScore,
          )
        ) {
          standardsShape += 1;
        }
      }
    }
    const average = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
    console.log(
      `\n  Importador sozinho: ${labels}/${reference.size} questões com o número certo, ${types} com tipo e ordem certos, ` +
        `gabarito ${keys}/${objectives}, alternativas idênticas à revisão ${optionsExact}/${objectives}, ` +
        `padrão com os mesmos subitens e pontos ${standardsShape}/${discursives}, ` +
        `enunciado ${Math.round(average * 100)}% igual em média (mínimo ${Math.round(Math.min(...similarities) * 100)}%).\n`,
    );
    step(
      "importador acha todas as questões com número, tipo e gabarito certos",
      labels === reference.size && types === reference.size && keys === objectives,
    );

    const examPath = `/admin/provas/${exam.id}`;
    const bulkHidden = await admin.form(examPath, 'name="examId"');
    const earlyPublish = await admin.post(examPath, [
      ...Object.entries(bulkHidden),
      ["acao", "publicar"],
      ...imported.map((question): [string, string] => ["ids", question.id]),
    ]);
    const earlyPublished = await db.question.count({
      where: { examId: exam.id, publishedAt: { not: null } },
    });
    const earlySummary = text(earlyPublish.body).match(/\d+ publicadas?[^.]*\./)?.[0] ?? "";
    step(
      "antes da revisão, o painel se recusa a publicar questões com pendência",
      earlyPublished < reference.size && earlySummary.includes("com pendência"),
      `${earlyPublished} publicadas, resumo: ${earlySummary}`,
    );
    if (earlyPublished > 0) {
      await admin.post(examPath, [
        ...Object.entries(bulkHidden),
        ["acao", "despublicar"],
        ["confirmacao", "sim"],
        ...imported.map((question): [string, string] => ["ids", question.id]),
      ]);
    }

    let saved = 0;
    for (const [label, draft] of reference) {
      const question = byLabel.get(label)!;
      const path = `/admin/questoes/${question.id}`;
      const hidden = await admin.form(path, 'name="statementMd"');
      const entries: [string, string][] = Object.entries(hidden).filter(
        ([key]) => key !== "standardId" && key !== "correct" && key !== "valuePoints",
      );
      entries.push(
        ["statementMd", draft.statementMd],
        ["area", draft.area],
        ["status", draft.status],
        ["valuePoints", draft.valuePoints === null ? "" : String(draft.valuePoints)],
      );
      for (const topic of draft.tags) entries.push(["topic", topic]);
      if (draft.type === "OBJECTIVE") {
        for (const option of draft.options)
          entries.push([`option_${option.letter}`, option.textMd]);
        entries.push(["correct", draft.options.find((option) => option.isCorrect)?.letter ?? ""]);
      } else {
        draft.answerStandards.forEach((standard, index) => {
          entries.push(
            ["standardId", question.answerStandards[index]?.id ?? ""],
            ["standardSubItem", standard.subItem ?? ""],
            ["standardMaxScore", standard.maxScore === null ? "" : String(standard.maxScore)],
            ["standardCriteria", standard.criteriaMd],
          );
        });
      }
      const response = await admin.post(path, entries);
      if (response.location.includes("salvo=1")) saved += 1;
      else
        console.log(
          `  editor recusou ${label}: ${text(response.body).match(/role="alert"[^<]*|Esta questão[^.]*\.|[A-Z][^.]{0,80}(inválid|precisa|Escolha|Marque)[^.]*\./)?.[0] ?? response.status}`,
        );
    }
    step(
      "revisão: as 40 questões corrigidas pelo editor do painel",
      saved === reference.size,
      `${saved}/${reference.size}`,
    );

    let uploads = 0;
    let expectedUploads = 0;
    const png = (filePath: string) =>
      new Blob([new Uint8Array(readFileSync(join(process.cwd(), "public/assets", filePath)))], {
        type: "image/png",
      });
    for (const [label, draft] of reference) {
      const question = await db.question.findUniqueOrThrow({
        where: { id: byLabel.get(label)!.id },
        include: { answerStandards: { orderBy: [{ subItem: "asc" }, { id: "asc" }] } },
      });
      const targets: [string | null, typeof draft.assets][] = [
        [null, draft.assets],
        ...draft.answerStandards.map((standard, index): [string | null, typeof draft.assets] => [
          question.answerStandards[index]?.id ?? null,
          standard.assets,
        ]),
      ];
      for (const [standardId, assets] of targets) {
        for (const asset of assets) {
          if (!asset.filePath) continue;
          expectedUploads += 1;
          const response = await admin.post(`/admin/imagens?questao=${question.id}`, [
            ["arquivo", png(asset.filePath), "figura.png"],
            ["legenda", asset.caption ?? ""],
            ...(standardId ? [["item", standardId] as [string, string]] : []),
          ]);
          if (response.location.includes("imagem=ok")) uploads += 1;
        }
      }
    }
    step(
      "figuras enviadas pelo painel",
      uploads === expectedUploads,
      `${uploads}/${expectedUploads}`,
    );

    const finalPublish = await admin.post(examPath, [
      ...Object.entries(await admin.form(examPath, 'name="examId"')),
      ["acao", "publicar"],
      ...imported.map((question): [string, string] => ["ids", question.id]),
    ]);
    const published = await db.question.count({
      where: { examId: exam.id, publishedAt: { not: null } },
    });
    step(
      "depois da revisão, publicar em lote publica todas",
      published === reference.size,
      text(finalPublish.body).match(/\d+ publicadas?[^.]*\./)?.[0] ?? `${published}`,
    );

    const final = await db.question.findMany({
      where: { examId: exam.id },
      include: {
        options: { orderBy: { letter: "asc" } },
        answerStandards: {
          orderBy: [{ subItem: "asc" }, { id: "asc" }],
          include: { assets: { orderBy: { position: "asc" } } },
        },
        assets: { where: { answerStandardId: null }, orderBy: { position: "asc" } },
        tags: { include: { topic: true } },
      },
    });
    const differences: string[] = [];
    for (const question of final) {
      const draft = reference.get(question.originalLabel)!;
      const problems: string[] = [];
      if (question.statementMd !== draft.statementMd.trim()) problems.push("enunciado");
      if (
        question.area !== draft.area ||
        question.status !== draft.status ||
        question.order !== draft.order
      )
        problems.push("classificação");
      if ((question.valuePoints ?? null) !== (draft.valuePoints ?? null)) problems.push("valor");
      if (
        JSON.stringify(question.options.map((o) => [o.letter, o.textMd, o.isCorrect])) !==
        JSON.stringify(draft.options.map((o) => [o.letter, o.textMd.trim(), o.isCorrect]))
      )
        problems.push("alternativas");
      if (
        JSON.stringify(
          question.answerStandards.map((s) => [
            s.subItem,
            s.maxScore,
            s.criteriaMd,
            s.assets.length,
          ]),
        ) !==
        JSON.stringify(
          draft.answerStandards.map((s) => [
            s.subItem,
            s.maxScore,
            s.criteriaMd.trim(),
            s.assets.filter((a) => a.filePath).length,
          ]),
        )
      )
        problems.push("padrão");
      if (
        JSON.stringify(question.tags.map((t) => t.topic.name).sort()) !==
        JSON.stringify([...draft.tags].sort())
      )
        problems.push("temas");
      if (
        JSON.stringify(question.assets.map((a) => a.caption ?? "")) !==
        JSON.stringify(draft.assets.filter((a) => a.filePath).map((a) => a.caption ?? ""))
      )
        problems.push("imagens");
      if (problems.length > 0)
        differences.push(`${question.originalLabel}: ${problems.join(", ")}`);
    }
    step(
      "resultado final idêntico à prova revisada à mão",
      differences.length === 0,
      differences.slice(0, 8).join(" | "),
    );

    await db.user.create({
      data: {
        email: STUDENT_EMAIL,
        name: "Aluno E2E",
        role: "STUDENT",
        passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
      },
    });
    const student = new Browser();
    await student.login(STUDENT_EMAIL, STUDENT_PASSWORD);
    const list = text((await student.request(`/questoes?ano=${YEAR}&status=TODAS`)).body);
    let pagesOk = 0;
    let imagesOk = 0;
    for (const question of final) {
      const page = await student.request(`/questoes/${question.id}`);
      if (page.status === 200) pagesOk += 1;
      const shown = (page.body.match(/src="\/imagens\/[a-f0-9]{24}\.png"/g) ?? []).length;
      if (shown >= question.assets.length) imagesOk += 1;
    }
    step(
      "o aluno vê a prova publicada, com as figuras",
      list.includes(`${reference.size} questões encontradas`) &&
        pagesOk === reference.size &&
        imagesOk === reference.size,
      `lista ok: ${list.includes(`${reference.size} questões encontradas`)}, páginas ${pagesOk}/${reference.size}, figuras ${imagesOk}/${reference.size}`,
    );
  } finally {
    server?.kill("SIGTERM");
    await db.$disconnect();
    rmSync(uploadDir, { recursive: true, force: true });
    if (!process.argv.includes("--manter")) {
      const cleanup = new PrismaClient({ datasourceUrl: mainUrl });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${E2E_DB}" WITH (FORCE)`);
      await cleanup.$disconnect();
    }
  }
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} etapas do teste de ponta a ponta passaram.`,
  );
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
