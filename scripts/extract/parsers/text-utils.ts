import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

const NOISE_PATTERNS: RegExp[] = [
  /^Área livre$/i,
  /^RASCUNHO$/,
  /^\d{1,2}$/,
  /^\*[A-Z]?\d+\*$/,
  /^(\*[A-Z]?\d+\*\s+)?(\d+\s+)?TECNOLOGIA EM ANÁLISE E(\s+DESENVOLVIMENTO DE SISTEMAS)?(\s+MATÉRIA)?(\s+D)?(\s+\d+)?$/,
  /^\d+\s+MATÉRIA$/,
  /^ENVOLVIMENTO DE SISTEMAS$/i,
  /^DESENVOLVIMENTO DE SISTEMAS(\s+\d+)?$/,
  /^(FORMAÇÃO GERAL|COMPONENTE ESPECÍFICO)$/,
  /^EXAME NACIONAL DE DESEMPENHO DOS ESTUDANTES$/i,
  /^20\d{2}$/,
];

function isNoiseLine(line: string): boolean {
  const normalized = line.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    return false;
  }
  return NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function cleanBlock(lines: string[]): string {
  const kept = lines.map((line) => line.replace(/\f/g, "")).filter((line) => !isNoiseLine(line));
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type HeaderMatch = {
  label: string;
  type: "OBJECTIVE" | "DISCURSIVE";
  lineIndex: number;
};

const DUAL_OBJECTIVE = /^QUESTÃO (\d+)\s{2,}QUESTÃO (\d+)$/;
const DISCURSIVE_HEADER = /^QUESTÃO DISCURSIVA (\d+)/;
const DISCURSIVE_HEADER_INLINE = /^QUESTÃO (\d+)\s*[–-]\s*DISCURSIVA\b/;
const OBJECTIVE_HEADER = /^QUESTÃO (\d+)\b/;

export function findHeaders(lines: string[]): HeaderMatch[] {
  const headers: HeaderMatch[] = [];

  lines.forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    const dual = line.match(DUAL_OBJECTIVE);
    if (dual) {
      headers.push({ label: String(Number(dual[1])), type: "OBJECTIVE", lineIndex });
      headers.push({ label: String(Number(dual[2])), type: "OBJECTIVE", lineIndex });
      return;
    }

    const discursive = line.match(DISCURSIVE_HEADER);
    if (discursive) {
      headers.push({ label: `D${Number(discursive[1])}`, type: "DISCURSIVE", lineIndex });
      return;
    }

    const discursiveInline = line.match(DISCURSIVE_HEADER_INLINE);
    if (discursiveInline) {
      headers.push({
        label: String(Number(discursiveInline[1])),
        type: "DISCURSIVE",
        lineIndex,
      });
      return;
    }

    const objective = line.match(OBJECTIVE_HEADER);
    if (objective) {
      headers.push({ label: String(Number(objective[1])), type: "OBJECTIVE", lineIndex });
    }
  });

  return headers;
}

function findPerceptionSurveyCutoff(headers: HeaderMatch[]): number | null {
  let maxSeen = 0;
  for (const header of headers) {
    if (header.type !== "OBJECTIVE") {
      continue;
    }
    const numeric = Number(header.label);
    if (Number.isNaN(numeric)) {
      continue;
    }
    if (maxSeen >= 15 && numeric <= 9 && numeric < maxSeen) {
      return header.lineIndex;
    }
    maxSeen = Math.max(maxSeen, numeric);
  }
  return null;
}

export function sliceQuestionBlocks(
  rawText: string,
): Map<string, { type: "OBJECTIVE" | "DISCURSIVE"; lines: string[] }> {
  const lines = rawText.split("\n");
  const allHeaders = findHeaders(lines);
  const cutoff = findPerceptionSurveyCutoff(allHeaders);
  const headers =
    cutoff === null ? allHeaders : allHeaders.filter((header) => header.lineIndex < cutoff);
  const blocks = new Map<string, { type: "OBJECTIVE" | "DISCURSIVE"; lines: string[] }>();

  headers.forEach((header, index) => {
    const nextHeader = headers[index + 1];
    const start = header.lineIndex + 1;
    const end = nextHeader ? nextHeader.lineIndex : (cutoff ?? lines.length);
    blocks.set(header.label, { type: header.type, lines: lines.slice(start, end) });
  });

  return blocks;
}

const VALOR_PATTERN = /\(valor:\s*([\d,]+)\s*pontos?\)/gi;

export function extractValores(text: string): number[] {
  return Array.from(text.matchAll(VALOR_PATTERN)).map((match) =>
    Number(match[1].replace(",", ".")),
  );
}

type OptionLines = { letter: string; lines: string[] };
type OptionStarts = Record<"A" | "B" | "C" | "D" | "E", number>;

const OPTION_LETTERS: Array<"A" | "B" | "C" | "D" | "E"> = ["A", "B", "C", "D", "E"];

function candidateIndices(lines: string[], letter: string): number[] {
  const regex = new RegExp(`^${letter}[ \\t]+`);
  const indices: number[] = [];
  lines.forEach((line, index) => {
    if (regex.test(line)) {
      indices.push(index);
    }
  });
  return indices;
}

export function findOptionStartIndices(lines: string[]): OptionStarts | null {
  const bCandidates = candidateIndices(lines, "B");
  const cCandidates = candidateIndices(lines, "C");
  const dCandidates = candidateIndices(lines, "D");
  const aCandidates = candidateIndices(lines, "A");
  const eCandidates = candidateIndices(lines, "E");

  for (const bIndex of bCandidates) {
    const cIndex = cCandidates.find((index) => index > bIndex);
    if (cIndex === undefined) continue;
    const dIndex = dCandidates.find((index) => index > cIndex);
    if (dIndex === undefined) continue;

    const aIndex = [...aCandidates].reverse().find((index) => index < bIndex);
    const eIndex = eCandidates.find((index) => index > dIndex);

    if (aIndex !== undefined && eIndex !== undefined) {
      return { A: aIndex, B: bIndex, C: cIndex, D: dIndex, E: eIndex };
    }
  }

  return null;
}

export function extractOptions(lines: string[]): OptionLines[] {
  const starts = findOptionStartIndices(lines);
  if (!starts) {
    return [];
  }

  return OPTION_LETTERS.map((letter, position) => {
    const start = starts[letter];
    const end =
      position < OPTION_LETTERS.length - 1 ? starts[OPTION_LETTERS[position + 1]] : lines.length;
    const firstLine = lines[start].replace(new RegExp(`^${letter}[ \\t]+`), "");
    return { letter, lines: [firstLine, ...lines.slice(start + 1, end)] };
  });
}

export function buildPageMap(
  pdfPath: string,
  totalPages: number,
  labels: string[],
): Map<string, number> {
  const pageMap = new Map<string, number>();
  const remaining = new Set(labels);

  for (let page = 1; page <= totalPages && remaining.size > 0; page += 1) {
    const pageText = execFileSync(
      "pdftotext",
      ["-layout", "-f", String(page), "-l", String(page), pdfPath, "-"],
      {
        encoding: "utf-8",
      },
    );

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

  return pageMap;
}

export type GabaritoEntry = { isAnulada: boolean; correctLetter: string | null };

export function parseGabarito(rawText: string): Map<string, GabaritoEntry> {
  const map = new Map<string, GabaritoEntry>();

  for (const rawLine of rawText.split("\n")) {
    const line = rawLine.trim();

    const discursive = line.match(/^QUESTÃO DISCURSIVA (\d+)\s+(.+)$/i);
    if (discursive) {
      map.set(`D${discursive[1]}`, { isAnulada: false, correctLetter: null });
      continue;
    }

    const objective = line.match(/^QUESTÃO (\d+)\s+(.+)$/i);
    const bare = line.match(/^(\d+)\s*-?\s+([A-E]|ANULADA)$/i);
    const objectiveMatch = objective ?? bare;
    if (objectiveMatch) {
      const value = objectiveMatch[2].trim();
      if (/anulada/i.test(value)) {
        map.set(objectiveMatch[1], { isAnulada: true, correctLetter: null });
      } else {
        const letter = value.match(/^[A-E]$/);
        map.set(objectiveMatch[1], { isAnulada: false, correctLetter: letter ? letter[0] : null });
      }
    }
  }

  return map;
}

export function getPdfPageCount(pdfPath: string): number {
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf-8" });
  const match = info.match(/Pages:\s+(\d+)/);
  if (!match) {
    throw new Error(`Não foi possível determinar o número de páginas de ${pdfPath}`);
  }
  return Number(match[1]);
}

export function getPdfPageSize(pdfPath: string): { width: number; height: number } {
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf-8" });
  const match = info.match(/Page size:\s+([\d.]+)\s*x\s*([\d.]+)\s*pts/);
  if (!match) {
    throw new Error(`Não foi possível determinar o tamanho de página de ${pdfPath}`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

const BBOX_WORD = /xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)</g;
const HEADER_FOOTER_MARGIN = 40;
const LINE_BUCKET = 2;
const X_BUCKET = 1;

export function detectColumnGap(pdfPath: string, page: number): ColumnFractions | null {
  const bbox = execFileSync(
    "pdftotext",
    ["-bbox", "-f", String(page), "-l", String(page), pdfPath, "-"],
    { encoding: "utf-8" },
  );
  const { width, height } = getPdfPageSize(pdfPath);

  const searchStart = width * 0.3;
  const searchEnd = width * 0.7;
  const bucketCount = Math.ceil((searchEnd - searchStart) / X_BUCKET);
  const lineBuckets = new Map<number, Set<number>>();

  for (const match of bbox.matchAll(BBOX_WORD)) {
    const xMin = Number(match[1]);
    const yMin = Number(match[2]);
    const xMax = Number(match[3]);
    if (yMin < HEADER_FOOTER_MARGIN || yMin > height - HEADER_FOOTER_MARGIN) {
      continue;
    }
    if (xMax <= searchStart || xMin >= searchEnd) {
      continue;
    }
    const lineKey = Math.round(yMin / LINE_BUCKET);
    const covered = lineBuckets.get(lineKey) ?? new Set<number>();
    const from = Math.max(0, Math.floor((xMin - searchStart) / X_BUCKET));
    const to = Math.min(bucketCount - 1, Math.ceil((xMax - searchStart) / X_BUCKET));
    for (let b = from; b <= to; b += 1) {
      covered.add(b);
    }
    lineBuckets.set(lineKey, covered);
  }

  const totalLines = lineBuckets.size;
  if (totalLines < 5) {
    return null;
  }

  const coverageCount = new Array(bucketCount).fill(0);
  for (const covered of lineBuckets.values()) {
    for (const b of covered) {
      coverageCount[b] += 1;
    }
  }

  const threshold = totalLines * 0.05;
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;

  for (let b = 0; b < bucketCount; b += 1) {
    if (coverageCount[b] <= threshold) {
      if (runStart === -1) {
        runStart = b;
      }
      if (b - runStart + 1 > bestLength) {
        bestLength = b - runStart + 1;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
    }
  }

  if (bestStart === -1 || bestLength * X_BUCKET < 6) {
    return null;
  }

  const leftEnd = searchStart + bestStart * X_BUCKET;
  const rightStart = searchStart + (bestStart + bestLength) * X_BUCKET;

  return { leftEnd: leftEnd / width, rightStart: rightStart / width };
}

export type ColumnFractions = { leftEnd: number; rightStart: number };

export const DEFAULT_COLUMN_FRACTIONS: ColumnFractions = {
  leftEnd: 305 / 580.517,
  rightStart: 320 / 580.517,
};

export function extractTwoColumnPageText(
  pdfPath: string,
  page: number,
  fractions: ColumnFractions = DEFAULT_COLUMN_FRACTIONS,
): string {
  const { width, height } = getPdfPageSize(pdfPath);
  const leftWidth = Math.round(width * fractions.leftEnd);
  const rightStart = Math.round(width * fractions.rightStart);
  const rightWidth = Math.round(width - rightStart);
  const heightRounded = Math.round(height);

  const left = execFileSync(
    "pdftotext",
    [
      "-layout",
      "-f",
      String(page),
      "-l",
      String(page),
      "-x",
      "0",
      "-y",
      "0",
      "-W",
      String(leftWidth),
      "-H",
      String(heightRounded),
      pdfPath,
      "-",
    ],
    { encoding: "utf-8" },
  );
  const right = execFileSync(
    "pdftotext",
    [
      "-layout",
      "-f",
      String(page),
      "-l",
      String(page),
      "-x",
      String(rightStart),
      "-y",
      "0",
      "-W",
      String(rightWidth),
      "-H",
      String(heightRounded),
      pdfPath,
      "-",
    ],
    { encoding: "utf-8" },
  );

  return `${left.trim()}\n\n${right.trim()}`;
}

export function extractPageText(pdfPath: string, page: number): string {
  return execFileSync(
    "pdftotext",
    ["-layout", "-f", String(page), "-l", String(page), pdfPath, "-"],
    {
      encoding: "utf-8",
    },
  ).trim();
}

const OCR_DPI = 300;

function withPageImage<T>(pdfPath: string, page: number, fn: (imagePath: string) => T): T {
  const dir = mkdtempSync(joinPath(tmpdir(), "tscq-ocr-"));
  try {
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      String(OCR_DPI),
      "-f",
      String(page),
      "-l",
      String(page),
      pdfPath,
      joinPath(dir, "page"),
    ]);
    const file = readdirSync(dir).find((name) => name.endsWith(".png"));
    if (!file) {
      throw new Error(`Falha ao renderizar página ${page} de ${pdfPath}`);
    }
    return fn(joinPath(dir, file));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ocrImage(imagePath: string, psm: number): string {
  return execFileSync("tesseract", [imagePath, "-", "-l", "por", "--psm", String(psm)], {
    encoding: "utf-8",
  }).trim();
}

export function ocrPageText(pdfPath: string, page: number): string {
  return withPageImage(pdfPath, page, (imagePath) => ocrImage(imagePath, 4));
}

export function ocrTwoColumnPageText(
  pdfPath: string,
  page: number,
  fractions: ColumnFractions = DEFAULT_COLUMN_FRACTIONS,
): string {
  return withPageImage(pdfPath, page, (imagePath) => {
    const dims = execFileSync("identify", ["-format", "%w %h", imagePath], { encoding: "utf-8" });
    const [width, height] = dims.trim().split(" ").map(Number);
    const leftWidth = Math.round(width * fractions.leftEnd);
    const rightStart = Math.round(width * fractions.rightStart);
    const rightWidth = width - rightStart;

    const dir = mkdtempSync(joinPath(tmpdir(), "tscq-ocr-col-"));
    try {
      const leftPath = joinPath(dir, "left.png");
      const rightPath = joinPath(dir, "right.png");
      execFileSync("magick", [
        imagePath,
        "-crop",
        `${leftWidth}x${height}+0+0`,
        "+repage",
        leftPath,
      ]);
      execFileSync("magick", [
        imagePath,
        "-crop",
        `${rightWidth}x${height}+${rightStart}+0`,
        "+repage",
        rightPath,
      ]);
      return `${ocrImage(leftPath, 4)}\n\n${ocrImage(rightPath, 4)}`;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
