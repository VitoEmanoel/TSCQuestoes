"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  LIMITS,
  type QuestionInput,
  saveQuestion,
  type StandardInput,
} from "@/lib/admin-questions";
import { getCurrentUser } from "@/lib/dal";
import { AREA_LABEL } from "@/lib/questions";

export type QuestionEditorState = { error?: string };

const STATUSES = ["VALID", "ANULADA"] as const;
const LETTERS = ["A", "B", "C", "D", "E"];

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
}

function texts(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value.replace(/\r\n/g, "\n") : ""));
}

function points(raw: string): number | null | undefined {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= LIMITS.points ? value : undefined;
}

function parse(formData: FormData): QuestionInput | string {
  const questionId = text(formData, "questionId");
  const expectedUpdatedAt = Number(text(formData, "updatedAt"));
  const statementMd = text(formData, "statementMd").trim();
  const area = text(formData, "area");
  const status = text(formData, "status");
  const valuePoints = points(text(formData, "valuePoints"));
  const correct = text(formData, "correct");
  if (!questionId || !Number.isInteger(expectedUpdatedAt)) {
    return "Formulário inválido. Recarregue a página.";
  }
  if (statementMd.length === 0 || statementMd.length > LIMITS.statement) {
    return `O enunciado precisa ter entre 1 e ${LIMITS.statement} caracteres.`;
  }
  if (!Object.hasOwn(AREA_LABEL, area)) {
    return "Área inválida.";
  }
  const validStatus = STATUSES.find((candidate) => candidate === status);
  if (!validStatus) {
    return "Situação inválida.";
  }
  if (valuePoints === undefined) {
    return `O valor da questão vai de 0 a ${LIMITS.points}.`;
  }
  const optionTexts = LETTERS.map((letter) => ({
    letter,
    present: formData.has(`option_${letter}`),
    textMd: text(formData, `option_${letter}`).trim(),
  }));
  const hasOptions = optionTexts.some((option) => option.present);
  if (
    hasOptions &&
    optionTexts.some(
      (option) =>
        !option.present || option.textMd.length === 0 || option.textMd.length > LIMITS.option,
    )
  ) {
    return `Cada alternativa precisa ter entre 1 e ${LIMITS.option} caracteres.`;
  }
  if (correct !== "" && !LETTERS.includes(correct)) {
    return "Alternativa correta inválida.";
  }
  const ids = texts(formData, "standardId");
  const subItems = texts(formData, "standardSubItem");
  const maxScores = texts(formData, "standardMaxScore");
  const criteria = texts(formData, "standardCriteria");
  if (
    ids.length > LIMITS.standards ||
    subItems.length !== ids.length ||
    maxScores.length !== ids.length ||
    criteria.length !== ids.length
  ) {
    return "Itens do padrão de resposta inválidos.";
  }
  const standards: StandardInput[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    const subItem = subItems[index].trim().toLowerCase();
    const maxScore = points(maxScores[index]);
    const criteriaMd = criteria[index].trim();
    if (subItem !== "" && !/^[a-z]$/.test(subItem)) {
      return "O subitem é uma letra só (a, b, c...) ou fica vazio.";
    }
    if (maxScore === undefined) {
      return `A pontuação de cada item vai de 0 a ${LIMITS.points}.`;
    }
    if (criteriaMd.length > LIMITS.criteria) {
      return `Cada item do padrão pode ter até ${LIMITS.criteria} caracteres.`;
    }
    const id = ids[index].trim();
    if (id !== "" && !/^[a-z0-9]{10,40}$/.test(id)) {
      return "Itens do padrão de resposta inválidos.";
    }
    standards.push({
      id: id === "" ? null : id,
      subItem: subItem === "" ? null : subItem,
      maxScore,
      criteriaMd,
    });
  }
  const subItemKeys = standards.map((standard) => standard.subItem ?? "");
  if (new Set(subItemKeys).size !== subItemKeys.length) {
    return "Não repita o mesmo subitem no padrão de resposta.";
  }
  const topics = [...new Set(texts(formData, "topic").map((topic) => topic.trim()))].filter(
    (topic) => topic !== "",
  );
  if (topics.length === 0 || topics.length > LIMITS.topics) {
    return `Escolha de 1 a ${LIMITS.topics} temas.`;
  }
  return {
    questionId,
    expectedUpdatedAt,
    statementMd,
    area: area as QuestionInput["area"],
    status: validStatus,
    valuePoints,
    options: hasOptions
      ? optionTexts.map((option) => ({ letter: option.letter, textMd: option.textMd }))
      : [],
    correctLetter: correct === "" ? null : correct,
    standards,
    topics,
  };
}

export async function saveQuestionAction(
  _state: QuestionEditorState,
  formData: FormData,
): Promise<QuestionEditorState> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return { error: "Acesso negado." };
  }
  const input = parse(formData);
  if (typeof input === "string") {
    return { error: input };
  }
  const outcome = await saveQuestion(input);
  if (outcome.status === "stale") {
    return {
      error:
        "Esta questão foi alterada em outra aba ou por outra pessoa depois que você abriu. Recarregue a página para ver a versão atual antes de salvar.",
    };
  }
  if (outcome.status === "invalid") {
    return { error: outcome.message };
  }
  revalidatePath(`/admin/questoes/${input.questionId}`);
  redirect(`/admin/questoes/${encodeURIComponent(input.questionId)}?salvo=1`);
}
