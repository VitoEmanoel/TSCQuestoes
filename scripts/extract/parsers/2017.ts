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
  extractPageText,
} from "./text-utils";
import { buildCipherWordMap, decodeCipherText } from "./glyph-cipher";
import type { AnswerStandardDraft, AssetDraft, OptionDraft, QuestionDraft } from "./types";

const YEAR = 2017;
const RAW_DIR = join(process.cwd(), "scripts/extract/raw", String(YEAR));
const DRAFT_DIR = join(process.cwd(), "scripts/extract/drafts", String(YEAR));
const PROVA_PDF = join(process.cwd(), "ProvasEnadeADS/2017/prova/41_TEC_ANA_DES_SIS_BAIXA.pdf");

const FORMACAO_GERAL_LABELS = new Set(["D1", "D2", "1", "2", "3", "4", "5", "6", "7", "8"]);
const DISCURSIVE_ORDER = ["D1", "D2", "D3", "D4", "D5"];

const QUESTION_ASSET_NOTES: Record<string, AssetDraft[]> = {
  "1": [{ kind: "image", filePath: "", caption: "Gráficos de barras (UE) — prova pág. 5" }],
  "4": [{ kind: "image", filePath: "", caption: "Tirinha (TEXTO 1) — prova pág. 8" }],
  "5": [{ kind: "image", filePath: "", caption: "Infográfico dos hidrogéis — prova pág. 9" }],
  "8": [
    {
      kind: "image",
      filePath: "",
      caption: "Objetivos de Desenvolvimento Sustentável — prova pág. 12",
    },
  ],
  D5: [{ kind: "image", filePath: "", caption: "Protótipos 1, 2 e 3 — prova pág. 16" }],
  "11": [{ kind: "diagram", filePath: "", caption: "Diagrama de classes — prova pág. 19" }],
  "16": [{ kind: "diagram", filePath: "", caption: "Diagrama de classes — prova pág. 22" }],
  "20": [
    { kind: "diagram", filePath: "", caption: "Diagramas de caso de uso A–E — prova pág. 25" },
  ],
  "26": [{ kind: "diagram", filePath: "", caption: "Diagrama de classes — prova pág. 29" }],
  "27": [{ kind: "diagram", filePath: "", caption: "Diagrama de classes — prova pág. 30" }],
  "32": [
    { kind: "diagram", filePath: "", caption: "Diagrama Entidade-Relacionamento — prova pág. 36" },
  ],
  "34": [
    { kind: "diagram", filePath: "", caption: "Diagrama Entidade-Relacionamento — prova pág. 38" },
  ],
  "35": [{ kind: "image", filePath: "", caption: "Protótipo da página inicial — prova pág. 39" }],
};

const ANSWER_STANDARD_ASSET_NOTES: Record<string, AssetDraft[]> = {
  D5: [
    {
      kind: "diagram",
      filePath: "",
      caption: "Diagrama de classes esperado — padrão de resposta",
    },
  ],
};

function areaFor(label: string): "FORMACAO_GERAL" | "COMPONENTE_ESPECIFICO" {
  return FORMACAO_GERAL_LABELS.has(label) ? "FORMACAO_GERAL" : "COMPONENTE_ESPECIFICO";
}

function sliceAnswerStandardBlocks(rawText: string): Map<string, string[]> {
  const lines = rawText
    .replace(/\f/g, "")
    .replace(/\uf0b7/g, "-")
    .split("\n")
    .filter((line) => line.trim() !== "ANÁLISE E DESENVOLVIMENTO DE SISTEMAS");
  const markers = lines
    .map((line, index) => (line.trim() === "PADRÃO DE RESPOSTA" ? index : -1))
    .filter((index) => index !== -1);

  const blocks = new Map<string, string[]>();
  markers.forEach((start, index) => {
    const label = DISCURSIVE_ORDER[index];
    if (label) {
      blocks.set(label, lines.slice(start + 1, markers[index + 1] ?? lines.length));
    }
  });
  return blocks;
}

function splitCriteriaIntoSubItems(lines: string[]): Map<string, string[]> | null {
  const firstMarkerIndex = lines.findIndex((line) => /^[a-z]\)\s*/.test(line.trim()));
  if (firstMarkerIndex === -1) {
    return null;
  }

  const subItems = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of lines.slice(firstMarkerIndex)) {
    const match = line.trim().match(/^([a-z])\)\s*(.*)$/);
    if (match) {
      current = match[1];
      subItems.set(current, [match[2]]);
      continue;
    }
    if (current) {
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
    reviewNotes.push("Questão precisa de imagem — ver docs/figuras-2017.md.");
  }

  return {
    examYear: YEAR,
    originalLabel: label,
    order,
    type: "OBJECTIVE",
    area: areaFor(label),
    status: isAnulada ? "ANULADA" : "VALID",
    statementMd,
    valuePoints: null,
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

  if (answerLines.length === 0) {
    reviewNotes.push("Não encontrei o bloco do padrão de resposta — revisar manualmente.");
  }
  const cleanedCriteria = cleanBlock(answerLines);
  const subItems = splitCriteriaIntoSubItems(cleanedCriteria.split("\n"));
  const valores = extractValores(cleanedStatement);
  const standardAssets = ANSWER_STANDARD_ASSET_NOTES[label] ?? [];

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
        assets: standardAssets,
      },
    ];
  }

  const assets = QUESTION_ASSET_NOTES[label] ?? [];
  if (assets.length > 0 || standardAssets.length > 0) {
    reviewNotes.push("Questão precisa de imagem — ver docs/figuras-2017.md.");
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
    needsAsset: assets.length > 0 || standardAssets.length > 0,
    assets,
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
  const pageMap = buildPageMap(PROVA_PDF, pageCount, Array.from(blocks.keys()), (page) =>
    decodeCipherText(extractPageText(PROVA_PDF, page), buildCipherWordMap(PROVA_PDF, page)),
  );

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
