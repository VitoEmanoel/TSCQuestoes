"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { AREA_LABEL, TYPE_LABEL } from "@/lib/questions";
import {
  createCustomSimulado,
  MAX_CUSTOM_QUESTIONS,
  MAX_OPEN_CUSTOM,
  MAX_SIMULADO_ANSWER_LENGTH,
  saveSimuladoAnswer,
  startReplay,
  submitSimulado,
  TIME_LIMIT_MINUTES,
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
  const minutesRaw = field(formData, "tempo") ?? "";
  const minutes = minutesRaw === "" ? null : Number(minutesRaw);
  if (minutes !== null && !TIME_LIMIT_MINUTES.some((allowed) => allowed === minutes)) {
    redirect("/simulados");
  }
  const attemptId = examId ? await startReplay(user.id, examId, minutes) : null;
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

export type CustomSimuladoState = { error?: string };

function pickKey<T extends string>(value: string | null, labels: Record<T, string>): T | undefined {
  return value && Object.hasOwn(labels, value) ? (value as T) : undefined;
}

export async function createCustomSimuladoAction(
  _state: CustomSimuladoState,
  formData: FormData,
): Promise<CustomSimuladoState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Sua sessão expirou. Entre novamente para montar o simulado." };
  }
  const yearRaw = field(formData, "ano") ?? "";
  const areaRaw = field(formData, "area") ?? "";
  const typeRaw = field(formData, "tipo") ?? "";
  const topicRaw = (field(formData, "tema") ?? "").trim();
  const count = Number(field(formData, "quantidade"));
  const minutesRaw = field(formData, "tempo") ?? "";
  const year = yearRaw === "" ? undefined : Number(yearRaw);
  const area = pickKey(areaRaw, AREA_LABEL);
  const type = pickKey(typeRaw, TYPE_LABEL);
  const minutes = minutesRaw === "" ? null : Number(minutesRaw);
  if (
    (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) ||
    (areaRaw !== "" && !area) ||
    (typeRaw !== "" && !type) ||
    topicRaw.length > 100 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_CUSTOM_QUESTIONS ||
    (minutes !== null && !TIME_LIMIT_MINUTES.some((allowed) => allowed === minutes))
  ) {
    return {
      error: `Confira as opções: de 1 a ${MAX_CUSTOM_QUESTIONS} questões e um dos tempos da lista.`,
    };
  }
  const outcome = await createCustomSimulado(user.id, {
    year,
    area,
    type,
    topic: topicRaw || undefined,
    count,
    minutes,
  });
  if (outcome.status === "empty") {
    return { error: "Nenhuma questão válida com esses filtros. Tente filtros mais amplos." };
  }
  if (outcome.status === "limit") {
    return {
      error: `Você já tem ${MAX_OPEN_CUSTOM} simulados personalizados em andamento. Entregue um deles antes de montar outro.`,
    };
  }
  redirect(
    outcome.picked < count
      ? `${simuladoPath(outcome.attemptId)}?pedidas=${count}`
      : simuladoPath(outcome.attemptId),
  );
}
