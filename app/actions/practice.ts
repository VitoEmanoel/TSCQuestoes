"use server";

import { getCurrentUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  answerDiscursive,
  answerObjective,
  finishPracticeSession,
  MAX_ANSWER_LENGTH,
  type ObjectiveResult,
  REVEAL_POLICIES,
  revealDiscursive,
  revealObjective,
  saveSelfEvaluation,
  setRevealPolicy,
} from "@/lib/practice";

export type ObjectiveAnswerState = { result?: ObjectiveResult; error?: string };

export async function answerObjectiveAction(
  _state: ObjectiveAnswerState,
  formData: FormData,
): Promise<ObjectiveAnswerState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente para responder." };
  }

  const questionId = formData.get("questionId");
  const letter = formData.get("letter");
  if (typeof questionId !== "string" || typeof letter !== "string" || !/^[A-E]$/.test(letter)) {
    return { error: "Escolha uma das alternativas antes de responder." };
  }

  const result = await answerObjective(user.id, questionId, letter);
  if (!result) {
    return { error: "Não foi possível registrar a resposta para esta questão." };
  }
  return { result };
}

export type DiscursiveAnswerState = { error?: string; values?: { answerText?: string } };

export async function answerDiscursiveAction(
  _state: DiscursiveAnswerState,
  formData: FormData,
): Promise<DiscursiveAnswerState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente para responder." };
  }
  const questionId = formData.get("questionId");
  const raw = formData.get("answerText");
  const answerText = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (typeof questionId !== "string") {
    return { error: "Não foi possível registrar a resposta para esta questão." };
  }
  if (answerText.length === 0) {
    return { error: "Escreva a sua resposta antes de enviar." };
  }
  if (answerText.length > MAX_ANSWER_LENGTH) {
    return {
      error: `A resposta pode ter no máximo ${MAX_ANSWER_LENGTH} caracteres.`,
      values: { answerText },
    };
  }
  const itemId = await answerDiscursive(user.id, questionId, answerText);
  if (!itemId) {
    return { error: "Não foi possível registrar a resposta para esta questão." };
  }
  redirect(`/questoes/${encodeURIComponent(questionId)}`);
}

export type SelfEvaluationState = { error?: string; savedTotal?: number; savedAt?: number };

export async function selfEvaluateAction(
  _state: SelfEvaluationState,
  formData: FormData,
): Promise<SelfEvaluationState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente." };
  }
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string") {
    return { error: "Não foi possível salvar a autoavaliação." };
  }
  const scores: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("score_") && typeof value === "string") {
      scores[key.slice("score_".length)] = Number(value.replace(",", "."));
    }
  }
  const result = await saveSelfEvaluation(user.id, itemId, scores);
  if (!result) {
    return { error: "Confira as notas: cada item vai de 0 até a pontuação máxima dele." };
  }
  return { savedTotal: result.total, savedAt: Date.now() };
}

export async function revealObjectiveAction(
  _state: ObjectiveAnswerState,
  formData: FormData,
): Promise<ObjectiveAnswerState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente." };
  }
  const itemId = formData.get("itemId");
  const result = typeof itemId === "string" ? await revealObjective(user.id, itemId) : null;
  if (!result) {
    return { error: "Esta correção ainda não pode ser mostrada." };
  }
  return { result };
}

export type RevealDiscursiveState = { error?: string };

export async function revealDiscursiveAction(
  _state: RevealDiscursiveState,
  formData: FormData,
): Promise<RevealDiscursiveState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente." };
  }
  const itemId = formData.get("itemId");
  const questionId = typeof itemId === "string" ? await revealDiscursive(user.id, itemId) : null;
  if (!questionId) {
    return { error: "Este padrão de resposta ainda não pode ser mostrado." };
  }
  redirect(`/questoes/${encodeURIComponent(questionId)}`);
}

export type PracticeSessionState = { error?: string; savedAt?: number };

export async function setRevealPolicyAction(
  _state: PracticeSessionState,
  formData: FormData,
): Promise<PracticeSessionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente." };
  }
  const policy = formData.get("policy");
  const valid = REVEAL_POLICIES.find((candidate) => candidate === policy);
  if (!valid) {
    return { error: "Escolha um dos modos de correção." };
  }
  if ((await setRevealPolicy(user.id, valid)) === "pending") {
    return {
      error:
        "Você tem respostas aguardando correção. Finalize a sessão antes de trocar o modo de correção.",
    };
  }
  revalidatePath("/questoes");
  return { savedAt: Date.now() };
}

export async function finishSessionAction(): Promise<PracticeSessionState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente." };
  }
  const attemptId = await finishPracticeSession(user.id);
  if (!attemptId) {
    return { error: "Não há respostas nesta sessão para corrigir." };
  }
  redirect(`/questoes/sessao/${attemptId}`);
}
