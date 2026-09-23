import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

export {
  cleanBlock,
  extractOptions,
  extractValores,
  findHeaders,
  findOptionStartIndices,
  parseGabarito,
  sliceQuestionBlocks,
} from "../../../lib/exam-text";
export type { GabaritoEntry, HeaderMatch } from "../../../lib/exam-text";

export function buildPageMap(
  pdfPath: string,
  totalPages: number,
  labels: string[],
  readPage: (page: number) => string = (page) => extractPageText(pdfPath, page),
): Map<string, number> {
  const pageMap = new Map<string, number>();
  const remaining = new Set(labels);

  for (let page = 1; page <= totalPages && remaining.size > 0; page += 1) {
    const pageText = readPage(page);

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
