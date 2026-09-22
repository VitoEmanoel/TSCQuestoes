import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractPageText, extractTwoColumnPageText, getPdfPageCount } from "./parsers/text-utils";

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

function extractWithColumnAwareness(pdfPath: string, ranges: PageRange[]): string {
  const totalPages = getPdfPageCount(pdfPath);
  const pages: string[] = [];

  for (let page = 1; page <= totalPages; page += 1) {
    pages.push(
      isTwoColumnPage(page, ranges)
        ? extractTwoColumnPageText(pdfPath, page)
        : extractPageText(pdfPath, page),
    );
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

      if (ranges) {
        writeFileSync(outputPath, extractWithColumnAwareness(pdfPath, ranges));
      } else {
        execFileSync("pdftotext", ["-layout", pdfPath, outputPath]);
      }

      console.log(`${year}/${tipo} -> ${outputPath}`);
    }
  }
}

main();
