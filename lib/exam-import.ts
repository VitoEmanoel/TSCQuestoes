import {
  cleanBlock,
  extractOptions,
  extractValores,
  findOptionStartIndices,
  parseGabarito,
  sliceQuestionBlocks,
} from "@/lib/exam-text";

export const IMPORT_LIMITS = {
  prova: 300_000,
  gabarito: 30_000,
  padrao: 200_000,
  questions: 80,
} as const;

export const MISSING_OPTION = "(alternativa não encontrada no texto — revisar)";

const FORMACAO_GERAL = new Set(["D1", "D2", "1", "2", "3", "4", "5", "6", "7", "8"]);
const LETTERS = ["A", "B", "C", "D", "E"];

export type ImportedStandard = {
  subItem: string | null;
  maxScore: number | null;
  criteriaMd: string;
};

export type ImportedQuestion = {
  label: string;
  order: number;
  type: "OBJECTIVE" | "DISCURSIVE";
  area: "FORMACAO_GERAL" | "COMPONENTE_ESPECIFICO";
  status: "VALID" | "ANULADA";
  statementMd: string;
  valuePoints: number | null;
  options: { letter: string; textMd: string; isCorrect: boolean }[];
  standards: ImportedStandard[];
  warnings: string[];
};

export type ImportResult = { questions: ImportedQuestion[]; warnings: string[] };

function normalize(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function answerBlocks(padrao: string): Map<string, string[]> {
  const lines = normalize(padrao).split("\n");
  const starts: { label: string; index: number }[] = [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const discursive = line.match(/^QUESTÃO DISCURSIVA (\d+)/i);
    const numbered = line.match(/^QUESTÃO (\d+)\b/i);
    if (discursive) {
      starts.push({ label: `D${Number(discursive[1])}`, index });
    } else if (numbered) {
      starts.push({ label: String(Number(numbered[1])), index });
    }
  });
  const blocks = new Map<string, string[]>();
  starts.forEach((start, position) => {
    const end = starts[position + 1]?.index ?? lines.length;
    blocks.set(start.label, lines.slice(start.index + 1, end));
  });
  return blocks;
}

function criteriaLines(block: string[]): string[] {
  const marker = block.findIndex((line) => /^PADRÃO DE RESPOSTA\b/i.test(line.trim()));
  return marker === -1 ? block : block.slice(marker + 1);
}

function splitSubItems(lines: string[]): Map<string, string[]> | null {
  const first = lines.find((line) => line.trim().length > 0);
  if (!first || !/^[a-z]\)\s*/.test(first.trim())) {
    return null;
  }
  const items = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines) {
    const match = line.trim().match(/^([a-z])\)\s*(.*)$/);
    if (match && !items.has(match[1])) {
      current = match[1];
      items.set(current, [match[2]]);
    } else if (current) {
      items.get(current)!.push(line);
    }
  }
  return items;
}

function buildStandards(
  block: string[] | undefined,
  valores: number[],
  warnings: string[],
): ImportedStandard[] {
  if (!block) {
    warnings.push("Sem padrão de resposta no texto colado — preencher no editor.");
    return [{ subItem: null, maxScore: sum(valores), criteriaMd: "" }];
  }
  const lines = criteriaLines(block);
  const items = splitSubItems(lines);
  if (!items) {
    return [{ subItem: null, maxScore: sum(valores), criteriaMd: cleanBlock(lines) }];
  }
  const entries = [...items];
  if (entries.length !== valores.length) {
    warnings.push(
      `Padrão com ${entries.length} subitens, mas o enunciado tem ${valores.length} valores em pontos — conferir as pontuações.`,
    );
  }
  return entries.map(([subItem, itemLines], index) => ({
    subItem,
    maxScore: entries.length === valores.length ? valores[index] : null,
    criteriaMd: cleanBlock(itemLines),
  }));
}

function sum(values: number[]): number | null {
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

export function parseExamText(input: {
  prova: string;
  gabarito: string;
  padrao: string;
}): ImportResult {
  const warnings: string[] = [];
  const blocks = [...sliceQuestionBlocks(normalize(input.prova))];
  const gabarito = parseGabarito(normalize(input.gabarito));
  const padrao = answerBlocks(input.padrao);
  if (blocks.length === 0) {
    warnings.push(
      "Nenhuma questão encontrada. O texto precisa ter cabeçalhos como “QUESTÃO 1” e “QUESTÃO DISCURSIVA 1”.",
    );
    return { questions: [], warnings };
  }
  if (blocks.length > IMPORT_LIMITS.questions) {
    warnings.push(`Foram encontradas mais de ${IMPORT_LIMITS.questions} questões.`);
    return { questions: [], warnings };
  }

  const questions = blocks.map(([label, block], index): ImportedQuestion => {
    const itemWarnings: string[] = [];
    const cleaned = cleanBlock(block.lines);
    const area = FORMACAO_GERAL.has(label) ? "FORMACAO_GERAL" : "COMPONENTE_ESPECIFICO";
    if (block.type === "DISCURSIVE") {
      const valores = extractValores(cleaned);
      if (cleaned.length === 0) {
        itemWarnings.push("Enunciado vazio.");
      }
      return {
        label,
        order: index + 1,
        type: "DISCURSIVE",
        area,
        status: "VALID",
        statementMd: cleaned,
        valuePoints: sum(valores),
        options: [],
        standards: buildStandards(padrao.get(label), valores, itemWarnings),
        warnings: itemWarnings,
      };
    }
    const lines = cleaned.split("\n");
    const parsed = extractOptions(lines);
    const starts = findOptionStartIndices(lines);
    const entry = gabarito.get(label);
    if (!entry) {
      itemWarnings.push("Não está no gabarito colado — marcar a correta no editor.");
    }
    const isAnulada = entry?.isAnulada ?? false;
    const correct = entry?.correctLetter ?? null;
    const found = parsed.length === LETTERS.length;
    if (!found) {
      itemWarnings.push("Não encontrei as 5 alternativas (A a E) — completar no editor.");
    }
    const statementMd = (found && starts ? lines.slice(0, starts.A) : lines).join("\n").trim();
    if (statementMd.length === 0) {
      itemWarnings.push("Enunciado vazio.");
    }
    return {
      label,
      order: index + 1,
      type: "OBJECTIVE",
      area,
      status: isAnulada ? "ANULADA" : "VALID",
      statementMd,
      valuePoints: null,
      options: LETTERS.map((letter) => {
        const option = found ? parsed.find((item) => item.letter === letter) : undefined;
        const textMd = option ? option.lines.join(" ").replace(/\s+/g, " ").trim() : "";
        return {
          letter,
          textMd: textMd || MISSING_OPTION,
          isCorrect: !isAnulada && letter === correct,
        };
      }),
      standards: [],
      warnings: itemWarnings,
    };
  });

  const labels = new Set(questions.map((question) => question.label));
  const orphan = [...gabarito.keys()].filter((label) => !labels.has(label));
  if (orphan.length > 0) {
    warnings.push(
      `O gabarito cita questões que não achei na prova: ${orphan.slice(0, 10).join(", ")}${orphan.length > 10 ? "…" : ""}.`,
    );
  }
  return { questions, warnings };
}
