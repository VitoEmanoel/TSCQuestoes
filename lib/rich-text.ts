export type RichBlock =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "image"; index: number; description: string }
  | { kind: "remaining-images"; description: string };

const MARKER = /\(ver (imagem anexa|imagens anexas)/;

function splitCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function unwrapLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .reduce<string[]>((lines, line) => {
      const previous = lines[lines.length - 1];
      if (previous && line && /^\p{Ll}/u.test(line)) {
        lines[lines.length - 1] = previous.endsWith("-") ? previous + line : `${previous} ${line}`;
      } else {
        lines.push(line);
      }
      return lines;
    }, [])
    .join("\n");
}

function findMarkerEnd(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function pushText(blocks: RichBlock[], text: string, imageCounter: { next: number }) {
  let rest = text;
  while (rest.length > 0) {
    const match = MARKER.exec(rest);
    const start = match ? match.index : -1;
    const end = start === -1 ? -1 : findMarkerEnd(rest, start);
    if (start === -1 || end === -1) {
      if (rest.trim()) blocks.push({ kind: "text", text: unwrapLines(rest.trim()) });
      return;
    }
    const before = rest.slice(0, start);
    if (before.trim()) blocks.push({ kind: "text", text: unwrapLines(before.trim()) });
    const description = rest
      .slice(start + match![0].length, end)
      .replace(/^\s*:/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (match![1] === "imagens anexas") {
      blocks.push({ kind: "remaining-images", description });
    } else {
      blocks.push({ kind: "image", index: imageCounter.next, description });
      imageCounter.next += 1;
    }
    rest = rest.slice(end + 1);
  }
}

export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const imageCounter = { next: 0 };
  const lines = source.split("\n");
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      pushText(blocks, buffer.join("\n"), imageCounter);
      buffer = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "```") {
      const close = lines.findIndex((candidate, j) => j > i && candidate.trim() === "```");
      if (close !== -1) {
        flush();
        blocks.push({ kind: "code", code: lines.slice(i + 1, close).join("\n") });
        i = close;
        continue;
      }
    }
    if (line.trim().startsWith("|")) {
      let end = i;
      while (end + 1 < lines.length && lines[end + 1].trim().startsWith("|")) end += 1;
      const tableLines = lines
        .slice(i, end + 1)
        .filter((row) => !/^\|?[\s|:-]+\|?$/.test(row.trim()));
      if (tableLines.length > 0) {
        flush();
        const [header, ...rows] = tableLines.map(splitCells);
        blocks.push({ kind: "table", header, rows });
        i = end;
        continue;
      }
    }
    buffer.push(line);
  }
  flush();
  return blocks;
}
