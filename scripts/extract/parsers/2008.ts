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

const YEAR = 2008;
const RAW_DIR = join(process.cwd(), "scripts/extract/raw", String(YEAR));
const DRAFT_DIR = join(process.cwd(), "scripts/extract/drafts", String(YEAR));
const PROVA_PDF = join(
  process.cwd(),
  "ProvasEnadeADS/2008/prova/TECNOLOGIA_DESENVOLVIMENTO_SISTEMAS.pdf",
);

const FORMACAO_GERAL_LABELS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

const QUESTION_ASSET_NOTES: Record<string, AssetDraft[]> = {
  "1": [
    { kind: "photo", filePath: "2008/1-1.png", caption: "Retrato I — prova pág. 1" },
    { kind: "photo", filePath: "2008/1-2.png", caption: "Retrato II — prova pág. 1" },
    { kind: "photo", filePath: "2008/1-3.png", caption: "Retrato III — prova pág. 1" },
    { kind: "photo", filePath: "2008/1-4.png", caption: "Retrato IV — prova pág. 1" },
    { kind: "photo", filePath: "2008/1-5.png", caption: "Retrato V — prova pág. 1" },
  ],
  "2": [{ kind: "photo", filePath: "2008/2-1.png", caption: "Colagem — prova pág. 2" }],
  "5": [{ kind: "photo", filePath: "2008/5-1.png", caption: "Foto histórica — prova pág. 2" }],
  "6": [{ kind: "map", filePath: "2008/6-1.png", caption: "Mapa — prova pág. 3" }],
  "7": [{ kind: "chart", filePath: "2008/7-1.png", caption: "Curva de Lorenz — prova pág. 3" }],
  "8": [
    { kind: "photo", filePath: "2008/8-1.png", caption: "Obra A — prova pág. 4" },
    { kind: "photo", filePath: "2008/8-2.png", caption: "Obra B — prova pág. 4" },
    { kind: "photo", filePath: "2008/8-3.png", caption: "Obra C — prova pág. 4" },
    { kind: "photo", filePath: "2008/8-4.png", caption: "Obra D — prova pág. 4" },
    { kind: "photo", filePath: "2008/8-5.png", caption: "Obra E — prova pág. 4" },
  ],
  "9": [{ kind: "photo", filePath: "2008/9-1.png", caption: "Foto — prova pág. 5" }],
  "10": [{ kind: "photo", filePath: "2008/10-1.png", caption: "Foto — prova pág. 6" }],
  "13": [
    {
      kind: "diagram",
      filePath: "2008/13-1.png",
      caption: "Diagrama de sequência UML — prova pág. 7",
    },
  ],
  "24": [
    {
      kind: "diagram",
      filePath: "2008/24-1.png",
      caption: "Diagrama de atividades UML — prova pág. 12",
    },
  ],
  "28": [
    { kind: "diagram", filePath: "2008/28-1.png", caption: "Diagrama de Venn — prova pág. 13" },
  ],
  "37": [
    { kind: "diagram", filePath: "2008/37-1.png", caption: "Diagrama de rede — prova pág. 16" },
  ],
};

const ANSWER_ASSET_NOTES: Record<string, Record<string, AssetDraft[]>> = {
  "38": {
    a: [
      {
        kind: "diagram",
        filePath: "2008/38-1.png",
        caption: "Diagrama de caso de uso esperado — padrão de resposta",
      },
    ],
  },
};

function areaFor(label: string): "FORMACAO_GERAL" | "COMPONENTE_ESPECIFICO" {
  return FORMACAO_GERAL_LABELS.has(label) ? "FORMACAO_GERAL" : "COMPONENTE_ESPECIFICO";
}

function normalizeInlineHeaders(rawText: string): string {
  return rawText.replace(/([^\n])[ \t]{2,}(QUESTÃO \d+(?:\s*[–-]\s*DISCURSIVA)?)/g, "$1\n$2");
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
    if (current && line.trim().length > 0) {
      subItems.get(current)!.push(line);
    }
  }

  return subItems;
}

function sliceAnswerStandardBlocks2008(rawText: string): Map<string, string[]> {
  const lines = rawText.split("\n");
  const indices: { label: string; lineIndex: number }[] = [];

  lines.forEach((rawLine, lineIndex) => {
    const match = rawLine.trim().match(/^(?:Questão|Discursiva)\s+(\d+)/i);
    if (match) {
      indices.push({ label: match[1], lineIndex });
    }
  });

  const blocks = new Map<string, string[]>();
  indices.forEach((entry, index) => {
    const next = indices[index + 1];
    const start = entry.lineIndex + 1;
    const end = next ? next.lineIndex : lines.length;
    blocks.set(entry.label, lines.slice(start, end));
  });

  return fixMislabeledAnswerBlock(blocks);
}

function fixMislabeledAnswerBlock(blocks: Map<string, string[]>): Map<string, string[]> {
  const mislabeled = blocks.get("39");
  if (mislabeled && mislabeled.some((line) => /matriz/i.test(line))) {
    blocks.delete("39");
    blocks.set("40", mislabeled);
  }
  return blocks;
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
    reviewNotes.push("Questão precisa de imagem — ver docs/figuras-2008.md.");
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
  isAnulada: boolean,
  sourcePage: number | null,
): QuestionDraft {
  const cleanedStatement = cleanBlock(provaLines);
  const reviewNotes: string[] = [];
  const valores = extractValores(cleanedStatement);
  const status = isAnulada ? "ANULADA" : "VALID";

  if (isAnulada) {
    reviewNotes.push("Questão ANULADA — não conta na nota final.");
  }

  if (answerLines.length === 0) {
    reviewNotes.push(
      "Não há padrão de resposta publicado pelo INEP para esta questão — revisar manualmente se necessário.",
    );
    return {
      examYear: YEAR,
      originalLabel: label,
      order,
      type: "DISCURSIVE",
      area: areaFor(label),
      status,
      statementMd: cleanedStatement,
      valuePoints: valores.length > 0 ? valores.reduce((a, b) => a + b, 0) : null,
      sourcePage,
      needsAsset: false,
      assets: [],
      options: [],
      answerStandards: [
        {
          subItem: null,
          criteriaMd: "",
          maxScore: valores.length === 1 ? valores[0] : null,
          assets: [],
        },
      ],
      tags: [],
      reviewNotes,
    };
  }

  const cleanedCriteria = cleanBlock(answerLines);
  const subItems = splitCriteriaIntoSubItems(cleanedCriteria.split("\n"));

  let answerStandards: AnswerStandardDraft[];

  if (subItems) {
    const subLabels = Array.from(subItems.keys());
    const answerAssets = ANSWER_ASSET_NOTES[label] ?? {};
    answerStandards = subLabels.map((subItem, index) => ({
      subItem,
      criteriaMd: subItems.get(subItem)!.join("\n").trim(),
      maxScore: subLabels.length === valores.length ? valores[index] : null,
      assets: answerAssets[subItem] ?? [],
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
    status,
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
  const provaRaw = normalizeInlineHeaders(readFileSync(join(RAW_DIR, "prova.txt"), "utf-8"));
  const gabaritoRaw = readFileSync(join(RAW_DIR, "gabarito.txt"), "utf-8");
  const padraoRaw = readFileSync(join(RAW_DIR, "padraoresposta.txt"), "utf-8");

  const blocks = sliceQuestionBlocks(provaRaw);
  const gabarito = parseGabarito(gabaritoRaw);
  const answerBlocks = sliceAnswerStandardBlocks2008(padraoRaw);
  const pageCount = getPdfPageCount(PROVA_PDF);
  const pageMap = buildPageMap(PROVA_PDF, pageCount, Array.from(blocks.keys()));

  mkdirSync(DRAFT_DIR, { recursive: true });

  let order = 0;
  for (const [label, block] of blocks) {
    order += 1;
    const sourcePage = pageMap.get(label) ?? null;
    const isAnulada = gabarito.get(label)?.isAnulada ?? false;

    const draft =
      block.type === "OBJECTIVE"
        ? buildObjectiveDraft(
            label,
            order,
            block.lines,
            gabarito.get(label)?.correctLetter ?? null,
            isAnulada,
            sourcePage,
          )
        : buildDiscursiveDraft(
            label,
            order,
            block.lines,
            answerBlocks.get(label) ?? [],
            isAnulada,
            sourcePage,
          );

    writeFileSync(join(DRAFT_DIR, `${label}.json`), `${JSON.stringify(draft, null, 2)}\n`);
    console.log(`${label} -> drafts/${YEAR}/${label}.json`);
  }
}

main();
