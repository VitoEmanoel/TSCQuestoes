"use server";

import { getCurrentUser } from "@/lib/dal";
import { answerObjective, type ObjectiveResult } from "@/lib/practice";

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
