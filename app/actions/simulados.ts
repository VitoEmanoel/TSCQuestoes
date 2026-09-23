"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import {
  MAX_SIMULADO_ANSWER_LENGTH,
  saveSimuladoAnswer,
  startReplay,
  submitSimulado,
} from "@/lib/simulados";

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

function simuladoPath(attemptId: string, position?: number): string {
  const base = `/simulados/${encodeURIComponent(attemptId)}`;
  return position ? `${base}?q=${position}` : base;
}

export async function startReplayAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/simulados");
  }
  const examId = field(formData, "examId");
  const attemptId = examId ? await startReplay(user.id, examId) : null;
  redirect(attemptId ? simuladoPath(attemptId) : "/simulados");
}

export type SimuladoAnswerState = { error?: string; values?: { answerText?: string } };

export async function saveSimuladoAnswerAction(
  _state: SimuladoAnswerState,
  formData: FormData,
): Promise<SimuladoAnswerState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente para continuar o simulado." };
  }
  const attemptId = field(formData, "attemptId");
  const questionId = field(formData, "questionId");
  const letter = field(formData, "letter");
  const rawText = field(formData, "answerText");
  const next = Number(field(formData, "next"));
  if (!attemptId || !questionId) {
    return { error: "Não foi possível salvar a resposta." };
  }
  if (rawText === null && (letter === null || !/^[A-E]$/.test(letter))) {
    return { error: "Escolha uma das alternativas antes de salvar." };
  }
  const text = rawText?.replace(/\r\n/g, "\n").trim() ?? "";
  if (rawText !== null && text.length === 0) {
    return { error: "Escreva a sua resposta antes de salvar." };
  }
  if (text.length > MAX_SIMULADO_ANSWER_LENGTH) {
    return {
      error: `A resposta pode ter no máximo ${MAX_SIMULADO_ANSWER_LENGTH} caracteres.`,
      values: { answerText: text },
    };
  }
  const outcome = await saveSimuladoAnswer(
    user.id,
    attemptId,
    questionId,
    rawText !== null ? { text } : { letter: letter ?? "" },
  );
  if (outcome === "closed") {
    redirect(`${simuladoPath(attemptId)}/resultado`);
  }
  if (outcome === "invalid") {
    return { error: "Não foi possível salvar a resposta para esta questão." };
  }
  redirect(simuladoPath(attemptId, Number.isInteger(next) && next > 0 ? next : undefined));
}

export async function submitSimuladoAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?callbackUrl=/simulados");
  }
  const attemptId = field(formData, "attemptId");
  const outcome = attemptId ? await submitSimulado(user.id, attemptId) : "invalid";
  redirect(
    outcome === "invalid" || !attemptId ? "/simulados" : `${simuladoPath(attemptId)}/resultado`,
  );
}
