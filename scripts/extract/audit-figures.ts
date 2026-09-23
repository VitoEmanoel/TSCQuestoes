import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPdfPageCount, getPdfPageSize } from "./parsers/text-utils";
import { listYears, loadDrafts } from "./validate";

const DPI = 40;
const SCALE = DPI / 72;
const BAND_PT = 12;
const DARK_LEVEL = 170;
const INK_RATIO = 0.035;
const MIN_INKED_BANDS = 4;
const MIN_INKED_ROWS = 4;
const UNIFORM_TOLERANCE = 0.2;
const MARGIN_TOP_PT = 75;
const MARGIN_BOTTOM_PT = 60;
const MARGIN_SIDE_PT = 40;

const REVIEWED: Record<string, Record<number, string>> = {
  "2011": { 8: "quadro da D2 convertido em tabela markdown", 21: "tabuleiro da D5 já em tabela" },
  "2021": { 17: "fila de cartões da D5 já coberta pela imagem da questão" },
};

type Word = { x0: number; y0: number; x1: number; y1: number; text: string };

function provaPdf(year: string): string {
  const dir = join(process.cwd(), "ProvasEnadeADS", year, "prova");
  const file = readdirSync(dir).find((name) => name.toLowerCase().endsWith(".pdf"));
  if (!file) throw new Error(`PDF da prova de ${year} não encontrado`);
  return join(dir, file);
}

function readWords(pdf: string, page: number): Word[] {
  const xml = execFileSync(
    "pdftotext",
    ["-bbox", "-f", String(page), "-l", String(page), pdf, "-"],
    {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  return [
    ...xml.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</g),
  ].map((match) => ({
    x0: Number(match[1]),
    y0: Number(match[2]),
    x1: Number(match[3]),
    y1: Number(match[4]),
    text: match[5],
  }));
}

function inkedBands(pdf: string, page: number, words: Word[], workDir: string): number {
  const { width, height } = getPdfPageSize(pdf);
  const base = join(workDir, `p${page}`);
  execFileSync("pdftoppm", [
    "-gray",
    "-r",
    String(DPI),
    "-f",
    String(page),
    "-l",
    String(page),
    "-singlefile",
    "-png",
    pdf,
    base,
  ]);
  const rectangles = words
    .map(
      (w) =>
        `rectangle ${Math.floor(w.x0 * SCALE) - 2},${Math.floor(w.y0 * SCALE) - 2} ${Math.ceil(w.x1 * SCALE) + 2},${Math.ceil(w.y1 * SCALE) + 2}`,
    )
    .join(" ");
  const pixels = execFileSync(
    "magick",
    [`${base}.png`, "-fill", "white", "-draw", rectangles || "point 0,0", "-depth", "8", "gray:-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const columns = Math.round(width * SCALE);
  const rows = Math.floor(pixels.length / columns);
  const left = Math.round(MARGIN_SIDE_PT * SCALE);
  const right = columns - left;
  const top = Math.round(MARGIN_TOP_PT * SCALE);
  const bottom = Math.min(rows, Math.round((height - MARGIN_BOTTOM_PT) * SCALE));
  const band = Math.max(1, Math.round(BAND_PT * SCALE));
  let inked = 0;
  for (let y = top; y < bottom; y += band) {
    const rowCounts: number[] = [];
    for (let row = y; row < Math.min(y + band, bottom); row += 1) {
      let dark = 0;
      for (let x = left; x < right; x += 1) {
        if (pixels[row * columns + x] < DARK_LEVEL) dark += 1;
      }
      rowCounts.push(dark);
    }
    const total = rowCounts.length * (right - left);
    const dark = rowCounts.reduce((sum, count) => sum + count, 0);
    const inkedRows = rowCounts.filter((count) => count > 2);
    const varies =
      inkedRows.length >= MIN_INKED_ROWS &&
      (Math.max(...inkedRows) - Math.min(...inkedRows)) / Math.max(...inkedRows) >
        UNIFORM_TOLERANCE;
    if (total > 0 && dark / total > INK_RATIO && varies) inked += 1;
  }
  return inked;
}

function main() {
  const suspects: string[] = [];
  for (const year of listYears()) {
    const pdf = provaPdf(year);
    const drafts = loadDrafts(year)
      .map(({ draft }) => draft)
      .filter((draft) => draft.sourcePage !== null)
      .sort((a, b) => a.order - b.order);
    const lastQuestionPage = Math.max(...drafts.map((draft) => draft.sourcePage ?? 0));
    const workDir = mkdtempSync(join(tmpdir(), `auditoria-${year}-`));
    try {
      for (let page = 2; page <= Math.min(getPdfPageCount(pdf), lastQuestionPage + 1); page += 1) {
        if (REVIEWED[year]?.[page]) continue;
        const words = readWords(pdf, page);
        const pageText = words.map((word) => word.text).join(" ");
        if (/RASCUNHO|QUESTIONÁRIO DE PERCEPÇÃO/.test(pageText)) continue;
        if (inkedBands(pdf, page, words, workDir) < MIN_INKED_BANDS) continue;
        const starting = drafts.filter((draft) => draft.sourcePage === page);
        const continuing = drafts.filter((draft) => (draft.sourcePage ?? 0) < page).at(-1);
        const owners = [...starting, ...(continuing ? [continuing] : [])];
        const explained = owners.some(
          (draft) =>
            draft.assets.length > 0 ||
            draft.answerStandards.some((standard) => standard.assets.length > 0) ||
            /^\|/m.test(draft.statementMd),
        );
        if (!explained) {
          suspects.push(
            `${year} pág. ${page}: desenho sem imagem/tabela nas questões ${owners.map((d) => d.originalLabel).join(", ") || "—"}`,
          );
        }
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
    console.log(`${year}: páginas verificadas até a ${lastQuestionPage + 1}`);
  }
  if (suspects.length > 0) {
    console.log(
      `\n${suspects.length} página(s) suspeita(s) — conferir no PDF:\n${suspects.join("\n")}`,
    );
    process.exit(1);
  }
  console.log("\nNenhuma página com desenho sem imagem ou tabela correspondente.");
}

main();
