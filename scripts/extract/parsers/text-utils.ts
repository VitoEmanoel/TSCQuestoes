import { execFileSync } from "node:child_process";

const NOISE_PATTERNS: RegExp[] = [
  /^Área livre$/,
  /^RASCUNHO$/,
  /^\d{1,2}$/,
  /^\*R?\d+\*$/,
  /^(\d+\s+)?TECNOLOGIA EM ANÁLISE E(\s+DESENVOLVIMENTO DE SISTEMAS)?(\s+MATÉRIA)?(\s+\d+)?$/,
  /^\d+\s+MATÉRIA$/,
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

export function truncateBeforePerceptionSurvey(rawText: string): string {
  const lines = rawText.split("\n");
  const index = lines.findLastIndex((line) =>
    /^questionário\s+de\s+percep[cç][aã]o/i.test(line.trim()),
  );
  if (index === -1) {
    return rawText;
  }
  return lines.slice(0, index).join("\n");
}

export type HeaderMatch = {
  label: string;
  type: "OBJECTIVE" | "DISCURSIVE";
  lineIndex: number;
};

const DUAL_OBJECTIVE = /^QUESTÃO (\d+)\s{2,}QUESTÃO (\d+)$/;
const DISCURSIVE_HEADER = /^QUESTÃO DISCURSIVA (\d+)/;
const OBJECTIVE_HEADER = /^QUESTÃO (\d+)$/;

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

export function sliceQuestionBlocks(
  rawText: string,
): Map<string, { type: "OBJECTIVE" | "DISCURSIVE"; lines: string[] }> {
  const truncated = truncateBeforePerceptionSurvey(rawText);
  const lines = truncated.split("\n");
  const headers = findHeaders(lines);
  const blocks = new Map<string, { type: "OBJECTIVE" | "DISCURSIVE"; lines: string[] }>();

  headers.forEach((header, index) => {
    const nextHeader = headers[index + 1];
    const start = header.lineIndex + 1;
    const end = nextHeader ? nextHeader.lineIndex : lines.length;
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
      const headerText = label.startsWith("D")
        ? `QUESTÃO DISCURSIVA ${label.slice(1).padStart(2, "0")}`
        : `QUESTÃO ${label.padStart(2, "0")}`;
      if (pageText.includes(headerText)) {
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
    if (objective) {
      const value = objective[2].trim();
      if (/anulada/i.test(value)) {
        map.set(objective[1], { isAnulada: true, correctLetter: null });
      } else {
        const letter = value.match(/^[A-E]$/);
        map.set(objective[1], { isAnulada: false, correctLetter: letter ? letter[0] : null });
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
