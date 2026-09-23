import { parseRichText } from "@/lib/rich-text";

export type PublishCandidate = {
  type: "OBJECTIVE" | "DISCURSIVE";
  status: "VALID" | "ANULADA";
  statementMd: string;
  options: { letter: string; textMd: string; isCorrect: boolean }[];
  standards: number;
  topics: number;
  statementAssets: number;
  reviewed: boolean;
};

const LETTERS = ["A", "B", "C", "D", "E"];

export function publishProblems(question: PublishCandidate): string[] {
  const problems: string[] = [];
  if (!question.reviewed) {
    problems.push("Ainda não foi revisada: abra no editor, confira e salve.");
  }
  if (question.statementMd.trim() === "") {
    problems.push("Enunciado vazio.");
  }
  if (question.topics === 0) {
    problems.push("Nenhum tema escolhido.");
  }
  if (question.type === "OBJECTIVE") {
    const letters = question.options.map((option) => option.letter).sort();
    if (letters.join("") !== LETTERS.join("")) {
      problems.push("A objetiva precisa das alternativas A, B, C, D e E.");
    }
    if (question.options.some((option) => option.textMd.trim() === "")) {
      problems.push("Há alternativa sem texto.");
    }
    const correct = question.options.filter((option) => option.isCorrect).length;
    if (correct > 1) {
      problems.push("Mais de uma alternativa marcada como correta.");
    } else if (correct === 0 && question.status === "VALID") {
      problems.push("Nenhuma alternativa marcada como correta.");
    }
  } else if (question.standards === 0) {
    problems.push("A discursiva não tem padrão de resposta.");
  }
  const markers = parseRichText(question.statementMd).filter(
    (block) => block.kind === "image",
  ).length;
  if (markers > question.statementAssets) {
    problems.push(
      `O texto tem ${markers} ${markers === 1 ? "marcador" : "marcadores"} de imagem e só ${question.statementAssets} ${question.statementAssets === 1 ? "imagem anexada" : "imagens anexadas"}.`,
    );
  }
  return problems;
}
