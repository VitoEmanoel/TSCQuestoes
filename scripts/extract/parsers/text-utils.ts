import { execFileSync } from "node:child_process";

const NOISE_PATTERNS: RegExp[] = [
  /^Área livre$/i,
  /^RASCUNHO$/,
  /^\d{1,2}$/,
  /^\*[A-Z]?\d+\*$/,
  /^(\*[A-Z]?\d+\*\s+)?(\d+\s+)?TECNOLOGIA EM ANÁLISE E(\s+DESENVOLVIMENTO DE SISTEMAS)?(\s+MATÉRIA)?(\s+D)?(\s+\d+)?$/,
  /^\d+\s+MATÉRIA$/,
  /^ENVOLVIMENTO DE SISTEMAS$/i,
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

const LEFT_COLUMN_END_FRACTION = 305 / 580.517;
const RIGHT_COLUMN_START_FRACTION = 320 / 580.517;

export function extractTwoColumnPageText(pdfPath: string, page: number): string {
  const { width, height } = getPdfPageSize(pdfPath);
  const leftWidth = Math.round(width * LEFT_COLUMN_END_FRACTION);
  const rightStart = Math.round(width * RIGHT_COLUMN_START_FRACTION);
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
