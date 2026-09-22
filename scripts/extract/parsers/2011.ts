import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPageMap,
  cleanBlock,
  extractOptions,
  extractValores,
  findOptionStartIndices,
  getPdfPageCount,
  parseGabarito,
  sliceQuestionBlocks,
} from "./text-utils";
import type { AnswerStandardDraft, AssetDraft, OptionDraft, QuestionDraft } from "./types";

const YEAR = 2011;
const RAW_DIR = join(process.cwd(), "scripts/extract/raw", String(YEAR));
const DRAFT_DIR = join(process.cwd(), "scripts/extract/drafts", String(YEAR));
const PROVA_PDF = join(
  process.cwd(),
  "ProvasEnadeADS/2011/prova/ANALISE_E_DESENVOLVIMENTO_DE_SISTEMAS.pdf",
);

const FORMACAO_GERAL_LABELS = new Set(["D1", "D2", "1", "2", "3", "4", "5", "6", "7", "8"]);

const QUESTION_ASSET_NOTES: Record<string, AssetDraft[]> = {
  "6": [
    { kind: "diagram", filePath: "", caption: "Infográfico desemprego x salário — prova pág. 5" },
  ],
  "11": [{ kind: "diagram", filePath: "", caption: "Diagrama de Casos de Uso UML — prova pág. 9" }],
  "14": [{ kind: "diagram", filePath: "", caption: "Diagrama de Atividades UML — prova pág. 10" }],
  "22": [
    { kind: "diagram", filePath: "", caption: "Diagrama Entidade-Relacionamento — prova pág. 13" },
  ],
  "23": [
    { kind: "diagram", filePath: "", caption: "Diagrama Entidade-Relacionamento — prova pág. 14" },
  ],
};

function areaFor(label: string): "FORMACAO_GERAL" | "COMPONENTE_ESPECIFICO" {
  return FORMACAO_GERAL_LABELS.has(label) ? "FORMACAO_GERAL" : "COMPONENTE_ESPECIFICO";
}

function sliceAnswerStandardBlocks(rawText: string): Map<string, string[]> {
  const lines = rawText.split("\n");
  const indices: { label: string; lineIndex: number }[] = [];

  lines.forEach((rawLine, lineIndex) => {
    const match = rawLine.trim().match(/^QUESTÃO DISCURSIVA (\d+)/);
    if (match) {
      indices.push({ label: `D${Number(match[1])}`, lineIndex });
    }
  });

  const blocks = new Map<string, string[]>();
  indices.forEach((entry, index) => {
    const next = indices[index + 1];
    const start = entry.lineIndex + 1;
    const end = next ? next.lineIndex : lines.length;
    blocks.set(entry.label, lines.slice(start, end));
  });

  return blocks;
}

function extractCriteriaLines(blockLines: string[]): string[] {
  const markerIndex = blockLines.findIndex((line) => /^Padrão de resposta$/i.test(line.trim()));
  if (markerIndex === -1) {
    return [];
  }
  return blockLines.slice(markerIndex + 1);
}

function splitCriteriaIntoSubItems(lines: string[]): Map<string, string[]> | null {
  const firstNonEmpty = lines.find((line) => line.trim().length > 0);
  if (!firstNonEmpty || !/^[a-z]\)\s*/.test(firstNonEmpty.trim())) {
    return null;
  }

  const subItems = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of lines) {
    const match = line.trim().match(/^([a-z])\)\s*(.*)$/);
    if (match) {
      current = match[1];
      subItems.set(current, [match[2]]);
      continue;
    }
    if (current && line.trim().length > 0) {
      subItems.get(current)!.push(line);
    }
  }

  return subItems;
}

function buildObjectiveDraft(
  label: string,
  order: number,
  lines: string[],
  correctLetter: string | null,
  isAnulada: boolean,
  sourcePage: number | null,
): QuestionDraft {
  const cleanedText = cleanBlock(lines);
  const cleanedLines = cleanedText.split("\n");
  const parsedOptions = extractOptions(cleanedLines);
  const reviewNotes: string[] = [];

  const options: OptionDraft[] = parsedOptions.map((option) => ({
    letter: option.letter,
    textMd: option.lines.join(" ").replace(/\s+/g, " ").trim(),
    isCorrect: option.letter === correctLetter,
  }));

  if (!isAnulada && options.length !== 5) {
    reviewNotes.push(`Esperava 5 alternativas, encontrou ${options.length} — revisar manualmente.`);
  }

  const optionStarts = findOptionStartIndices(cleanedLines);
  const statementMd = (optionStarts ? cleanedLines.slice(0, optionStarts.A) : cleanedLines)
    .join("\n")
    .trim();

  const assets = QUESTION_ASSET_NOTES[label] ?? [];
  if (assets.length > 0) {
    reviewNotes.push("Questão precisa de imagem — ver docs/figuras-2011.md.");
  }

  const valores = extractValores(cleanedText);

  return {
    examYear: YEAR,
    originalLabel: label,
    order,
    type: "OBJECTIVE",
    area: areaFor(label),
    status: isAnulada ? "ANULADA" : "VALID",
    statementMd,
    valuePoints: valores.length > 0 ? valores.reduce((a, b) => a + b, 0) : null,
    sourcePage,
    needsAsset: assets.length > 0,
    assets,
    options,
    answerStandards: [],
    tags: [],
    reviewNotes,
  };
}

function buildDiscursiveDraft(
  label: string,
  order: number,
  provaLines: string[],
  answerLines: string[],
  sourcePage: number | null,
): QuestionDraft {
  const cleanedStatement = cleanBlock(provaLines);
  const reviewNotes: string[] = [];

  const criteriaLines = extractCriteriaLines(answerLines);
  if (criteriaLines.length === 0) {
    reviewNotes.push("Não encontrei o marcador 'Padrão de resposta' — revisar manualmente.");
  }
  const cleanedCriteria = cleanBlock(criteriaLines);
  const subItems = splitCriteriaIntoSubItems(cleanedCriteria.split("\n"));

  const valores = extractValores(cleanedStatement);

  let answerStandards: AnswerStandardDraft[];

  if (subItems) {
    const subLabels = Array.from(subItems.keys());
    answerStandards = subLabels.map((subItem, index) => ({
      subItem,
      criteriaMd: subItems.get(subItem)!.join("\n").trim(),
      maxScore: subLabels.length === valores.length ? valores[index] : null,
      assets: [],
    }));
    if (subLabels.length !== valores.length) {
      reviewNotes.push(
        "Não bateu a quantidade de subitens com a quantidade de valores encontrados — revisar pontuação.",
      );
    }
  } else {
    answerStandards = [
      {
        subItem: null,
        criteriaMd: cleanedCriteria,
        maxScore: valores.length === 1 ? valores[0] : null,
        assets: [],
      },
    ];
  }

  return {
    examYear: YEAR,
    originalLabel: label,
    order,
    type: "DISCURSIVE",
    area: areaFor(label),
    status: "VALID",
    statementMd: cleanedStatement,
    valuePoints: valores.length > 0 ? valores.reduce((a, b) => a + b, 0) : null,
    sourcePage,
    needsAsset: false,
    assets: [],
    options: [],
    answerStandards,
    tags: [],
    reviewNotes,
  };
}

function main() {
  const provaRaw = readFileSync(join(RAW_DIR, "prova.txt"), "utf-8");
  const gabaritoRaw = readFileSync(join(RAW_DIR, "gabarito.txt"), "utf-8");
  const padraoRaw = readFileSync(join(RAW_DIR, "padraoresposta.txt"), "utf-8");

  const blocks = sliceQuestionBlocks(provaRaw);
  const gabarito = parseGabarito(gabaritoRaw);
  const answerBlocks = sliceAnswerStandardBlocks(padraoRaw);
  const pageCount = getPdfPageCount(PROVA_PDF);
  const pageMap = buildPageMap(PROVA_PDF, pageCount, Array.from(blocks.keys()));

  mkdirSync(DRAFT_DIR, { recursive: true });

  let order = 0;
  for (const [label, block] of blocks) {
    order += 1;
    const sourcePage = pageMap.get(label) ?? null;

    const draft =
      block.type === "OBJECTIVE"
        ? buildObjectiveDraft(
            label,
            order,
            block.lines,
            gabarito.get(label)?.correctLetter ?? null,
            gabarito.get(label)?.isAnulada ?? false,
            sourcePage,
          )
        : buildDiscursiveDraft(
            label,
            order,
            block.lines,
            answerBlocks.get(label) ?? [],
            sourcePage,
          );

    writeFileSync(join(DRAFT_DIR, `${label}.json`), `${JSON.stringify(draft, null, 2)}\n`);
    console.log(`${label} -> drafts/${YEAR}/${label}.json`);
  }
}

main();
