import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanBlock,
  extractValores,
  getPdfPageCount,
  ocrPageText,
  parseGabarito,
  sliceQuestionBlocks,
} from "./text-utils";
import type { AnswerStandardDraft, AssetDraft, OptionDraft, QuestionDraft } from "./types";

const YEAR = 2014;
const RAW_DIR = join(process.cwd(), "scripts/extract/raw", String(YEAR));
const DRAFT_DIR = join(process.cwd(), "scripts/extract/drafts", String(YEAR));
const PROVA_PDF = join(
  process.cwd(),
  "ProvasEnadeADS/2014/prova/40_tecnologia_analise_desenv_sistemas.pdf",
);

const FORMACAO_GERAL_LABELS = new Set(["D1", "D2", "1", "2", "3", "4", "5", "6", "7", "8"]);

const OPTION_IMAGE_LABEL = "29";

const QUESTION_ASSET_NOTES: Record<string, AssetDraft[]> = {
  "3": [{ kind: "chart", filePath: "2014/3-1.png", caption: "Gráfico de barras — prova pág. 5" }],
  "6": [{ kind: "chart", filePath: "2014/6-1.png", caption: "Gráfico de barras — prova pág. 7" }],
  "9": [{ kind: "diagram", filePath: "2014/9-1.png", caption: "Diagrama EAP — prova pág. 12" }],
  "11": [
    {
      kind: "diagram",
      filePath: "2014/11-1.png",
      caption: "Diagrama Entidade-Relacionamento — prova pág. 14",
    },
  ],
  "15": [
    {
      kind: "diagram",
      filePath: "2014/15-1.png",
      caption: "Diagrama de arquitetura — prova pág. 16",
    },
  ],
  "20": [{ kind: "diagram", filePath: "2014/20-1.png", caption: "Árvore binária — prova pág. 19" }],
  "21": [
    {
      kind: "diagram",
      filePath: "2014/21-1.png",
      caption: "Diagrama lógico de dados — prova pág. 19",
    },
  ],
  [OPTION_IMAGE_LABEL]: [
    {
      kind: "diagram",
      filePath: "2014/29-1.png",
      caption: "Diagrama de classes UML por alternativa (A–E) — prova pág. 23",
    },
  ],
};

function areaFor(label: string): "FORMACAO_GERAL" | "COMPONENTE_ESPECIFICO" {
  return FORMACAO_GERAL_LABELS.has(label) ? "FORMACAO_GERAL" : "COMPONENTE_ESPECIFICO";
}

const OCR_OPTION_MARKER = /^[OQ0]{1,2}/;
const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

function extractOcrOptions(lines: string[]): { letter: string; lines: string[] }[] {
  const markerIndices = lines
    .map((line, index) => (OCR_OPTION_MARKER.test(line) ? index : -1))
    .filter((index) => index !== -1);
  const optionStarts = markerIndices.slice(-5);

  return optionStarts.map((start, i) => {
    const end = optionStarts[i + 1] ?? lines.length;
    return { letter: OPTION_LETTERS[i], lines: lines.slice(start, end) };
  });
}

function stripOptionMarker(text: string): string {
  return text.replace(OCR_OPTION_MARKER, "").trim();
}

function sliceAnswerStandardBlocks2014(rawText: string): string[] {
  const normalized = rawText.replace(
    /\n[^\S\n]*P[^\S\n]*\nADRÃO DE RESPOSTA/g,
    "\nPADRÃO DE RESPOSTA",
  );
  const lines = normalized.split("\n");
  const markers = lines
    .map((line, index) => (line.trim() === "PADRÃO DE RESPOSTA" ? index : -1))
    .filter((index) => index !== -1);

  return markers.map((start, i) => {
    const end = markers[i + 1] ?? lines.length;
    return lines.slice(start + 1, end).join("\n");
  });
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
  const reviewNotes: string[] = [];
  const assets = QUESTION_ASSET_NOTES[label] ?? [];

  let statementMd: string;
  let options: OptionDraft[];

  if (label === OPTION_IMAGE_LABEL) {
    statementMd = cleanedText;
    options = OPTION_LETTERS.map((letter) => ({
      letter,
      textMd: `(diagrama — ver opção ${letter} na imagem anexa)`,
      isCorrect: letter === correctLetter,
    }));
    reviewNotes.push(
      "As 5 alternativas são diagramas UML (imagem única com A–E) — revisar textMd manualmente se quiser transcrever.",
    );
  } else {
    const parsedOptions = extractOcrOptions(cleanedLines);
    options = parsedOptions.map((option) => ({
      letter: option.letter,
      textMd: stripOptionMarker(option.lines.join(" ")).replace(/\s+/g, " ").trim(),
      isCorrect: option.letter === correctLetter,
    }));

    if (!isAnulada && options.length !== 5) {
      reviewNotes.push(
        `Esperava 5 alternativas, encontrou ${options.length} — revisar manualmente.`,
      );
    }

    const firstOptionLine = parsedOptions[0]
      ? cleanedLines.indexOf(parsedOptions[0].lines[0])
      : cleanedLines.length;
    statementMd = cleanedLines.slice(0, firstOptionLine).join("\n").trim();
  }

  if (assets.length > 0 && label !== OPTION_IMAGE_LABEL) {
    reviewNotes.push("Questão precisa de imagem — ver docs/figuras-2014.md.");
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
  criteriaLines: string[],
  sourcePage: number | null,
): QuestionDraft {
  const cleanedStatement = cleanBlock(provaLines);
  const reviewNotes: string[] = [];

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

function buildPageMapOcr(
  pdfPath: string,
  totalPages: number,
  labels: string[],
): Map<string, number> {
  const pageMap = new Map<string, number>();
  const remaining = new Set(labels);

  for (let page = 1; page <= totalPages && remaining.size > 0; page += 1) {
    const pageText = ocrPageText(pdfPath, page);

    for (const label of Array.from(remaining)) {
      const number = label.startsWith("D") ? label.slice(1) : label;
      const prefix = label.startsWith("D") ? "QUESTÃO DISCURSIVA " : "QUESTÃO ";
      const candidates = [`${prefix}${number}`, `${prefix}${number.padStart(2, "0")}`];
      if (candidates.some((candidate) => pageText.includes(candidate))) {
        pageMap.set(label, page);
        remaining.delete(label);
      }
    }
  }

  if (remaining.has("11")) {
    pageMap.set("11", 14);
    remaining.delete("11");
  }

  return pageMap;
}

function main() {
  const provaRaw = readFileSync(join(RAW_DIR, "prova.txt"), "utf-8");
  const gabaritoRaw = readFileSync(join(RAW_DIR, "gabarito.txt"), "utf-8");
  const padraoRaw = readFileSync(join(RAW_DIR, "padraoresposta.txt"), "utf-8");

  const blocks = sliceQuestionBlocks(provaRaw);
  const gabarito = parseGabarito(gabaritoRaw);
  const answerBlocks = sliceAnswerStandardBlocks2014(padraoRaw);
  const pageCount = getPdfPageCount(PROVA_PDF);
  const pageMap = buildPageMapOcr(PROVA_PDF, pageCount, Array.from(blocks.keys()));

  mkdirSync(DRAFT_DIR, { recursive: true });

  let order = 0;
  let discursiveIndex = 0;
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
            (answerBlocks[discursiveIndex++] ?? "").split("\n"),
            sourcePage,
          );

    writeFileSync(join(DRAFT_DIR, `${label}.json`), `${JSON.stringify(draft, null, 2)}\n`);
    console.log(`${label} -> drafts/${YEAR}/${label}.json`);
  }
}

main();
