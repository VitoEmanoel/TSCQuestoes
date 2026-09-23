import { execFileSync } from "node:child_process";

type CipherKind = "calibri" | "courier" | null;

const CALIBRI_GLYPHS: Record<number, string> = {
  0x0003: " ",
  0x0004: "A",
  0x0005: "À",
  0x0006: "Á",
  0x0007: "Â",
  0x0008: "Ã",
  0x0011: "B",
  0x0012: "C",
  0x0018: "D",
  0x001c: "E",
  0x001e: "É",
  0x001f: "Ê",
  0x0026: "F",
  0x0027: "G",
  0x002c: "H",
  0x002f: "I",
  0x0031: "Í",
  0x003a: "J",
  0x003e: "L",
  0x0044: "M",
  0x0045: "N",
  0x004b: "O",
  0x004d: "Ó",
  0x004e: "Ô",
  0x0050: "Õ",
  0x0057: "P",
  0x0059: "Q",
  0x005a: "R",
  0x005e: "S",
  0x0064: "T",
  0x0068: "U",
  0x006a: "Ú",
  0x0073: "V",
  0x0074: "W",
  0x0079: "X",
  0x0102: "a",
  0x0103: "à",
  0x0104: "á",
  0x0105: "â",
  0x0106: "ã",
  0x010f: "b",
  0x0110: "c",
  0x0115: "ç",
  0x011a: "d",
  0x011e: "e",
  0x0120: "é",
  0x0121: "ê",
  0x0128: "f",
  0x012e: "fi",
  0x0130: "fí",
  0x0147: "fl",
  0x014c: "ft",
  0x0150: "g",
  0x015a: "h",
  0x015d: "i",
  0x015f: "í",
  0x0169: "j",
  0x016c: "k",
  0x016f: "l",
  0x0175: "m",
  0x0176: "n",
  0x017d: "o",
  0x017f: "ó",
  0x0180: "ô",
  0x0181: "õ",
  0x0189: "p",
  0x018b: "q",
  0x018c: "r",
  0x0190: "s",
  0x019a: "t",
  0x019f: "ti",
  0x01a1: "tí",
  0x01a9: "tt",
  0x01b5: "u",
  0x01b7: "ú",
  0x01c0: "v",
  0x01c1: "w",
  0x01c6: "x",
  0x01c7: "y",
  0x01cc: "z",
  0x01d1: "º",
  0x034a: "!",
  0x034d: "?",
  0x0355: ",",
  0x0356: ";",
  0x0357: ":",
  0x0358: ".",
  0x035e: "“",
  0x035f: "”",
  0x036c: "/",
  0x0372: "-",
  0x0373: "-",
  0x0374: "–",
  0x0376: "—",
  0x0378: "—",
  0x037b: "•",
  0x037e: "(",
  0x037f: ")",
  0x0381: "]",
  0x0382: "{",
  0x0383: "}",
  0x0397: '"',
  0x03a3: "º",
  0x03a6: "€",
  0x03a8: "$",
  0x03ec: "0",
  0x03ed: "1",
  0x03ee: "2",
  0x03ef: "3",
  0x03f0: "4",
  0x03f1: "5",
  0x03f2: "6",
  0x03f3: "7",
  0x03f4: "8",
  0x03f5: "9",
  0x0439: "%",
  0x043d: "+",
  0x0444: "<",
  0x0445: ">",
};

const COURIER_SHIFT = 29;

const COURIER_SPECIALS: Record<number, string> = {
  0x00bf: "fi",
  0x006d: "ã",
  0x006f: "ç",
};

type Chunk = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  kind: CipherKind;
  text: string;
};

type Word = { xMin: number; yMin: number; xMax: number; yMax: number; text: string };

const XML_FONTSPEC = /<fontspec id="(\d+)" size="[\d.]+" family="([^"]+)"/g;
const XML_PAGE = /<page number="(\d+)"[^>]*height="([\d.]+)" width="([\d.]+)">([\s\S]*?)<\/page>/g;
const XML_TEXT =
  /<text top="(-?[\d.]+)" left="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" font="(\d+)">(.*)<\/text>/g;
const BBOX_PAGE = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
const BBOX_WORD =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;

function unescapeXml(text: string): string {
  return text
    .replace(/<\/?[a-z]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function fontKind(family: string): CipherKind {
  if (family.includes("CourierNewPSMT-Identity")) {
    return "courier";
  }
  if (family === "Calibri" || (family.startsWith("Calibri-") && family.includes("Identity"))) {
    return "calibri";
  }
  return null;
}

function hasCipherCode(text: string): boolean {
  return [...text].some((char) => {
    const code = char.codePointAt(0)!;
    return code < 0x20 || (code >= 0x100 && code < 0x2000);
  });
}

function decodeChar(char: string, kind: CipherKind): string {
  const code = char.codePointAt(0)!;
  if (kind === "courier") {
    return COURIER_SPECIALS[code] ?? String.fromCodePoint(code + COURIER_SHIFT);
  }
  if (kind === "calibri") {
    return CALIBRI_GLYPHS[code] ?? char;
  }
  return char;
}

function readChunks(pdfPath: string): Map<number, { scale: number; chunks: Chunk[] }> {
  const xml = execFileSync("pdftohtml", ["-xml", "-i", "-stdout", pdfPath], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const fonts = new Map<string, CipherKind>();
  for (const match of xml.matchAll(XML_FONTSPEC)) {
    fonts.set(match[1], fontKind(match[2]));
  }
  const bboxWidths = readBboxPageWidths(pdfPath);
  const pages = new Map<number, { scale: number; chunks: Chunk[] }>();
  for (const pageMatch of xml.matchAll(XML_PAGE)) {
    const pageNumber = Number(pageMatch[1]);
    const scale = Number(pageMatch[3]) / (bboxWidths[pageNumber - 1] ?? Number(pageMatch[3]));
    const chunks: Chunk[] = [];
    for (const match of pageMatch[4].matchAll(XML_TEXT)) {
      const top = Number(match[1]) / scale;
      const left = Number(match[2]) / scale;
      chunks.push({
        top,
        left,
        right: left + Number(match[3]) / scale,
        bottom: top + Number(match[4]) / scale,
        kind: fonts.get(match[5]) ?? null,
        text: unescapeXml(match[6]),
      });
    }
    pages.set(pageNumber, { scale, chunks });
  }
  return pages;
}

function readBboxPageWidths(pdfPath: string): number[] {
  const bbox = execFileSync("pdftotext", ["-bbox", pdfPath, "-"], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...bbox.matchAll(BBOX_PAGE)].map((match) => Number(match[1]));
}

function readWords(pdfPath: string, page: number): Word[] {
  const bbox = execFileSync(
    "pdftotext",
    ["-bbox", "-f", String(page), "-l", String(page), pdfPath, "-"],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
  );
  return [...bbox.matchAll(BBOX_WORD)].map((match) => ({
    xMin: Number(match[1]),
    yMin: Number(match[2]),
    xMax: Number(match[3]),
    yMax: Number(match[4]),
    text: unescapeXml(match[5]),
  }));
}

function overlappingChunks(word: Word, chunks: Chunk[]): Chunk[] {
  const centerY = (word.yMin + word.yMax) / 2;
  return chunks
    .filter(
      (chunk) =>
        chunk.left < word.xMax + 1 &&
        chunk.right > word.xMin - 1 &&
        centerY >= chunk.top - 2 &&
        centerY <= chunk.bottom + 2,
    )
    .sort((a, b) => a.left - b.left);
}

function locateKinds(word: Word, overlapping: Chunk[], visible: string[]): CipherKind[] | null {
  const expected: Array<{ char: string; kind: CipherKind }> = [];
  for (const chunk of overlapping) {
    for (const char of chunk.text) {
      if (char !== " ") {
        expected.push({ char, kind: chunk.kind });
      }
    }
  }
  const needle = visible.join("");
  if (needle.length === 0 || expected.length === 0) {
    return null;
  }
  const haystack = expected.map((entry) => entry.char);
  const joined = haystack.join("");
  const spanLeft = overlapping[0].left;
  const spanRight = overlapping[overlapping.length - 1].right;
  const estimate = ((word.xMin - spanLeft) / Math.max(1, spanRight - spanLeft)) * haystack.length;

  let best = -1;
  let bestDistance = Infinity;
  for (let from = joined.indexOf(needle); from !== -1; from = joined.indexOf(needle, from + 1)) {
    const charIndex = [...joined.slice(0, from)].length;
    const distance = Math.abs(charIndex - estimate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = charIndex;
    }
  }
  if (best === -1) {
    return null;
  }
  return expected.slice(best, best + visible.length).map((entry) => entry.kind);
}

function decodeWord(word: Word, chunks: Chunk[]): string {
  const overlapping = overlappingChunks(word, chunks);
  const cipherKinds = new Set(
    overlapping.map((chunk) => chunk.kind).filter((kind) => kind !== null),
  );
  const fallbackKind: CipherKind = cipherKinds.size === 1 ? [...cipherKinds][0] : "calibri";
  const chars = [...word.text];
  const visible = chars.filter((char) => char.codePointAt(0)! >= 0x20);
  const kinds = locateKinds(word, overlapping, visible);

  if (kinds === null) {
    const onlyCipher = overlapping.length > 0 && overlapping.every((chunk) => chunk.kind !== null);
    return chars
      .map((char) => (onlyCipher || hasCipherCode(char) ? decodeChar(char, fallbackKind) : char))
      .join("");
  }

  let currentKind: CipherKind = kinds.find((kind) => kind !== null) ?? fallbackKind;
  let index = 0;
  let output = "";
  for (const char of chars) {
    if (char.codePointAt(0)! < 0x20) {
      output += decodeChar(char, currentKind);
      continue;
    }
    const kind = kinds[index];
    index += 1;
    if (kind !== null) {
      currentKind = kind;
    }
    output += decodeChar(char, kind);
  }
  return output;
}

const chunkCache = new Map<string, Map<number, { scale: number; chunks: Chunk[] }>>();

export function buildCipherWordMap(pdfPath: string, page: number): Map<string, string> {
  if (!chunkCache.has(pdfPath)) {
    chunkCache.set(pdfPath, readChunks(pdfPath));
  }
  const chunks = chunkCache.get(pdfPath)!.get(page)?.chunks ?? [];
  const votes = new Map<string, Map<string, number>>();
  for (const word of readWords(pdfPath, page)) {
    const overlapping = overlappingChunks(word, chunks);
    const touchesCipher = overlapping.some((chunk) => chunk.kind !== null);
    if (!touchesCipher && !hasCipherCode(word.text)) {
      continue;
    }
    const decoded = decodeWord(word, chunks);
    const counts = votes.get(word.text) ?? new Map<string, number>();
    counts.set(decoded, (counts.get(decoded) ?? 0) + 1);
    votes.set(word.text, counts);
  }
  const map = new Map<string, string>();
  for (const [raw, counts] of votes) {
    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    map.set(raw, best[0]);
  }
  return map;
}

export function decodeCipherText(text: string, wordMap: Map<string, string>): string {
  return text
    .split(/( +|\n)/)
    .map((token) => {
      if (token.length === 0 || /^( +|\n)$/.test(token)) {
        return token;
      }
      const mapped = wordMap.get(token);
      if (mapped !== undefined) {
        return mapped;
      }
      return hasCipherCode(token)
        ? [...token]
            .map((char) => (hasCipherCode(char) ? decodeChar(char, "calibri") : char))
            .join("")
        : token;
    })
    .join("");
}
