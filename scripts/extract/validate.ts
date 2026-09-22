import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { QuestionDraft } from "./parsers/types";

type Level = "error" | "warning";

type Issue = {
  file: string;
  level: Level;
  message: string;
};

const DRAFTS_ROOT = join(process.cwd(), "scripts/extract/drafts");
const ASSETS_ROOT = join(process.cwd(), "public/assets");

function listYears(): string[] {
  const requestedYear = process.argv[2];
  if (requestedYear) {
    return [requestedYear];
  }
  return readdirSync(DRAFTS_ROOT).filter((name) => /^\d{4}$/.test(name));
}

function loadDrafts(year: string): { file: string; draft: QuestionDraft }[] {
  const yearDir = join(DRAFTS_ROOT, year);
  return readdirSync(yearDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      file: join(year, name),
      draft: JSON.parse(readFileSync(join(yearDir, name), "utf-8")) as QuestionDraft,
    }));
}

function checkAssets(
  file: string,
  assets: QuestionDraft["assets"],
  context: string,
  issues: Issue[],
): void {
  for (const asset of assets) {
    if (!asset.filePath) {
      issues.push({
        file,
        level: "error",
        message: `${context}: asset "${asset.caption ?? asset.kind}" sem filePath preenchido`,
      });
      continue;
    }
    if (!existsSync(join(ASSETS_ROOT, asset.filePath))) {
      issues.push({
        file,
        level: "error",
        message: `${context}: asset aponta para arquivo inexistente: ${asset.filePath}`,
      });
    }
  }
}

function validateDraft(file: string, draft: QuestionDraft): Issue[] {
  const issues: Issue[] = [];
  const push = (level: Level, message: string) => issues.push({ file, level, message });

  const expectedLabel = file
    .split("/")
    .pop()
    ?.replace(/\.json$/, "");
  if (expectedLabel !== draft.originalLabel) {
    push(
      "error",
      `nome do arquivo (${expectedLabel}) não bate com originalLabel (${draft.originalLabel})`,
    );
  }

  const expectedYear = Number(file.split("/")[0]);
  if (expectedYear !== draft.examYear) {
    push("error", `pasta do ano (${expectedYear}) não bate com examYear (${draft.examYear})`);
  }

  if (!draft.statementMd.trim()) {
    push("error", "statementMd está vazio");
  }

  const hasQuestionAssets = draft.assets.length > 0;
  const hasAnswerStandardAssets = draft.answerStandards.some((a) => a.assets.length > 0);
  if (draft.needsAsset && !hasQuestionAssets && !hasAnswerStandardAssets) {
    push("error", "needsAsset=true mas nenhum asset foi encontrado");
  }
  if (!draft.needsAsset && (hasQuestionAssets || hasAnswerStandardAssets)) {
    push("warning", "há assets, mas needsAsset está false");
  }

  checkAssets(file, draft.assets, "questão", issues);
  for (const answerStandard of draft.answerStandards) {
    checkAssets(
      file,
      answerStandard.assets,
      `padrão de resposta${answerStandard.subItem ? ` (${answerStandard.subItem})` : ""}`,
      issues,
    );
  }

  if (draft.type === "OBJECTIVE") {
    if (draft.answerStandards.length > 0) {
      push("error", "questão objetiva não deveria ter answerStandards");
    }

    if (draft.status === "VALID") {
      if (draft.options.length !== 5) {
        push("error", `esperava 5 alternativas, encontrou ${draft.options.length}`);
      }
      const letters = draft.options.map((option) => option.letter);
      const uniqueLetters = new Set(letters);
      if (uniqueLetters.size !== letters.length) {
        push("error", "há letras de alternativa repetidas");
      }
      const correctCount = draft.options.filter((option) => option.isCorrect).length;
      if (correctCount !== 1) {
        push("error", `esperava exatamente 1 alternativa correta, encontrou ${correctCount}`);
      }
    }
  }

  if (draft.type === "DISCURSIVE") {
    if (draft.options.length > 0) {
      push("error", "questão discursiva não deveria ter options");
    }

    if (draft.answerStandards.length === 0) {
      push("error", "questão discursiva sem nenhum answerStandard");
    }

    const scores = draft.answerStandards.map((a) => a.maxScore);
    if (scores.every((score) => score !== null) && draft.valuePoints !== null) {
      const sum = scores.reduce((a, b) => a! + b!, 0);
      if (Math.abs((sum ?? 0) - draft.valuePoints) > 0.01) {
        push(
          "error",
          `soma dos maxScore (${sum}) não bate com valuePoints da questão (${draft.valuePoints})`,
        );
      }
    } else if (scores.some((score) => score === null)) {
      push("warning", "algum answerStandard está sem maxScore definido");
    }
  }

  if (draft.sourcePage === null) {
    push("warning", "sourcePage não foi identificado");
  }

  if (draft.reviewNotes.length > 0) {
    push("warning", `${draft.reviewNotes.length} nota(s) de revisão pendente(s)`);
  }

  return issues;
}

function main() {
  const years = listYears();
  const issues: Issue[] = [];
  const seenLabels = new Map<string, string>();
  const seenOrders = new Map<string, string>();

  for (const year of years) {
    for (const { file, draft } of loadDrafts(year)) {
      issues.push(...validateDraft(file, draft));

      const labelKey = `${draft.examYear}/${draft.originalLabel}`;
      if (seenLabels.has(labelKey)) {
        issues.push({
          file,
          level: "error",
          message: `originalLabel duplicado, também usado em ${seenLabels.get(labelKey)}`,
        });
      }
      seenLabels.set(labelKey, file);

      const orderKey = `${draft.examYear}/${draft.order}`;
      if (seenOrders.has(orderKey)) {
        issues.push({
          file,
          level: "error",
          message: `order duplicado, também usado em ${seenOrders.get(orderKey)}`,
        });
      }
      seenOrders.set(orderKey, file);
    }
  }

  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");

  for (const issue of issues) {
    const tag = issue.level === "error" ? "ERRO" : "aviso";
    console.log(`[${tag}] ${issue.file}: ${issue.message}`);
  }

  console.log(`\n${errors.length} erro(s), ${warnings.length} aviso(s).`);

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
