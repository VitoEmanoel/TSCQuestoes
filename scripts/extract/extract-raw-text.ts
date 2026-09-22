import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ColumnFractions,
  DEFAULT_COLUMN_FRACTIONS,
  extractPageText,
  extractTwoColumnPageText,
  getPdfPageCount,
  ocrPageText,
  ocrTwoColumnPageText,
} from "./parsers/text-utils";

const SOURCE_ROOT = join(process.cwd(), "ProvasEnadeADS");
const OUTPUT_ROOT = join(process.cwd(), "scripts/extract/raw");

type PageRange = [number, number];

const TWO_COLUMN_PAGE_RANGES: Record<string, Record<string, PageRange[]>> = {
  "2011": {
    prova: [
      [3, 3],
      [5, 5],
      [9, 18],
    ],
  },
  "2014": {
    prova: [
      [6, 6],
      [8, 8],
      [13, 13],
      [15, 22],
      [23, 23],
      [24, 26],
    ],
  },
};

const COLUMN_FRACTIONS: Record<string, ColumnFractions> = {
  "2014": { leftEnd: 857 / 1745, rightStart: 886 / 1745 },
};

const OCR_EXTRACTION: Record<string, string[]> = {
  "2014": ["prova"],
};

const HEADER_OVERRIDES: Record<string, Record<string, Record<number, string>>> = {
  "2014": {
    prova: {
      14: "QUESTÃO 11",
    },
  },
};

function listDirs(path: string): string[] {
  return readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory());
}

function findPdf(path: string): string {
  const file = readdirSync(path).find((name) => name.toLowerCase().endsWith(".pdf"));
  if (!file) {
    throw new Error(`Nenhum PDF encontrado em ${path}`);
  }
  return join(path, file);
}

function isTwoColumnPage(page: number, ranges: PageRange[]): boolean {
  return ranges.some(([start, end]) => page >= start && page <= end);
}

function extractWithColumnAwareness(
  pdfPath: string,
  ranges: PageRange[],
  useOcr: boolean,
  fractions: ColumnFractions,
  headerOverrides: Record<number, string>,
): string {
  const totalPages = getPdfPageCount(pdfPath);
  const pages: string[] = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const twoColumn = isTwoColumnPage(page, ranges);
    let pageText: string;
    if (useOcr) {
      pageText = twoColumn
        ? ocrTwoColumnPageText(pdfPath, page, fractions)
        : ocrPageText(pdfPath, page);
    } else {
      pageText = twoColumn
        ? extractTwoColumnPageText(pdfPath, page, fractions)
        : extractPageText(pdfPath, page);
    }
    const override = headerOverrides[page];
    pages.push(override ? `${override}\n\n${pageText}` : pageText);
    console.log(`  página ${page}/${totalPages}${useOcr ? " (OCR)" : ""}`);
  }

  return pages.join("\n\n");
}

function main() {
  for (const year of listDirs(SOURCE_ROOT)) {
    const yearPath = join(SOURCE_ROOT, year);
    const outputYearDir = join(OUTPUT_ROOT, year);
    mkdirSync(outputYearDir, { recursive: true });

    for (const tipo of listDirs(yearPath)) {
      const pdfPath = findPdf(join(yearPath, tipo));
      const outputPath = join(outputYearDir, `${tipo}.txt`);
      const ranges = TWO_COLUMN_PAGE_RANGES[year]?.[tipo];
      const useOcr = OCR_EXTRACTION[year]?.includes(tipo) ?? false;
      const fractions = COLUMN_FRACTIONS[year] ?? DEFAULT_COLUMN_FRACTIONS;
      const headerOverrides = HEADER_OVERRIDES[year]?.[tipo] ?? {};

      if (ranges || useOcr) {
        writeFileSync(
          outputPath,
          extractWithColumnAwareness(pdfPath, ranges ?? [], useOcr, fractions, headerOverrides),
        );
      } else {
        execFileSync("pdftotext", ["-layout", pdfPath, outputPath]);
      }

      console.log(`${year}/${tipo} -> ${outputPath}`);
    }
  }
}

main();
