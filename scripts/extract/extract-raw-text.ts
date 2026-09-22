import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE_ROOT = join(process.cwd(), "ProvasEnadeADS");
const OUTPUT_ROOT = join(process.cwd(), "scripts/extract/raw");

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

function main() {
  for (const year of listDirs(SOURCE_ROOT)) {
    const yearPath = join(SOURCE_ROOT, year);
    const outputYearDir = join(OUTPUT_ROOT, year);
    mkdirSync(outputYearDir, { recursive: true });

    for (const tipo of listDirs(yearPath)) {
      const pdfPath = findPdf(join(yearPath, tipo));
      const outputPath = join(outputYearDir, `${tipo}.txt`);
      execFileSync("pdftotext", ["-layout", pdfPath, outputPath]);
      console.log(`${year}/${tipo} -> ${outputPath}`);
    }
  }
}

main();
