import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ColumnFractions,
  DEFAULT_COLUMN_FRACTIONS,
  detectColumnGap,
  extractPageText,
  extractTwoColumnPageText,
  getPdfPageCount,
  ocrPageText,
  ocrTwoColumnPageText,
} from "./parsers/text-utils";

const SOURCE_ROOT = join(process.cwd(), "ProvasEnadeADS");
const OUTPUT_ROOT = join(process.cwd(), "scripts/extract/raw");

type PageRange = [number, number];
type ColumnRangeConfig = { range: PageRange; fractions?: ColumnFractions };

const TWO_COLUMN_PAGE_RANGES: Record<string, Record<string, ColumnRangeConfig[]>> = {
  "2011": {
    prova: [{ range: [3, 3] }, { range: [5, 5] }, { range: [9, 18] }],
  },
  "2014": {
    prova: [
      { range: [6, 6] },
      { range: [8, 8] },
      { range: [13, 13] },
      { range: [15, 22] },
      { range: [23, 23] },
      { range: [24, 26] },
    ],
  },
  "2008": {
    prova: [{ range: [4, 4] }, { range: [9, 17] }],
  },
};

const COLUMN_FRACTIONS: Record<string, ColumnFractions> = {
  "2014": { leftEnd: 857 / 1745, rightStart: 886 / 1745 },
};

const AUTO_COLUMN_DETECTION: Record<string, string[]> = {
  "2008": ["prova"],
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

function findColumnConfig(page: number, ranges: ColumnRangeConfig[]): ColumnRangeConfig | null {
  return ranges.find(({ range: [start, end] }) => page >= start && page <= end) ?? null;
}

function extractWithColumnAwareness(
  pdfPath: string,
  ranges: ColumnRangeConfig[],
  useOcr: boolean,
  defaultFractions: ColumnFractions,
  headerOverrides: Record<number, string>,
  autoDetect: boolean,
): string {
  const totalPages = getPdfPageCount(pdfPath);
  const pages: string[] = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const columnConfig = findColumnConfig(page, ranges);
    const fractions =
      columnConfig?.fractions ??
      (columnConfig && autoDetect ? detectColumnGap(pdfPath, page) : null) ??
      defaultFractions;
    let pageText: string;
    if (useOcr) {
      pageText = columnConfig
        ? ocrTwoColumnPageText(pdfPath, page, fractions)
        : ocrPageText(pdfPath, page);
    } else {
      pageText = columnConfig
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
      const autoDetect = AUTO_COLUMN_DETECTION[year]?.includes(tipo) ?? false;

      if (ranges || useOcr) {
        writeFileSync(
          outputPath,
          extractWithColumnAwareness(
            pdfPath,
            ranges ?? [],
            useOcr,
            fractions,
            headerOverrides,
            autoDetect,
          ),
        );
      } else {
        execFileSync("pdftotext", ["-layout", pdfPath, outputPath]);
      }

      console.log(`${year}/${tipo} -> ${outputPath}`);
    }
  }
}

main();
