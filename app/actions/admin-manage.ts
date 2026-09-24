"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createQuestion,
  deleteQuestion,
  moveQuestion,
  normalizeLabel,
  renameQuestion,
} from "@/lib/admin-manage";
import { getCurrentUser } from "@/lib/dal";
import { AREA_LABEL, TYPE_LABEL } from "@/lib/questions";

const ID = /^[a-z0-9]{10,40}$/;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && user.role === "ADMIN");
}

export type ManageState = { error?: string; saved?: string };

export async function createQuestionAction(
  _state: ManageState,
  formData: FormData,
): Promise<ManageState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const examId = field(formData, "examId");
  const type = field(formData, "tipo");
  const area = field(formData, "area");
  const label = normalizeLabel(field(formData, "numero"));
  if (!ID.test(examId) || !Object.hasOwn(TYPE_LABEL, type) || !Object.hasOwn(AREA_LABEL, area)) {
    return { error: "Pedido inválido." };
  }
  if (!label) {
    return {
      error: "Número inválido. Use só números (ex.: 36) ou D + número para discursiva (ex.: D6).",
    };
  }
  const outcome = await createQuestion({
    examId,
    label,
    type: type as keyof typeof TYPE_LABEL,
    area: area as keyof typeof AREA_LABEL,
  });
  if (outcome.status === "duplicate") {
    return { error: `Já existe a questão ${label} nesta prova.` };
  }
  if (outcome.status === "missing") {
    return { error: "Prova não encontrada." };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/questoes/${outcome.questionId}?nova=1`);
}

export async function renameQuestionAction(
  _state: ManageState,
  formData: FormData,
): Promise<ManageState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const questionId = field(formData, "questionId");
  const label = normalizeLabel(field(formData, "numero"));
  if (!ID.test(questionId)) {
    return { error: "Pedido inválido." };
  }
  if (!label) {
    return { error: "Número inválido. Use só números (ex.: 36) ou D + número (ex.: D6)." };
  }
  const outcome = await renameQuestion(questionId, label);
  if (outcome === "duplicate") {
    return { error: `Já existe a questão ${label} nesta prova.` };
  }
  if (outcome === "missing") {
    return { error: "Questão não encontrada." };
  }
  revalidatePath("/admin", "layout");
  return { saved: label };
}

export async function moveQuestionAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    return;
  }
  const [questionId, direction] = field(formData, "mover").split(":");
  if (!ID.test(questionId ?? "") || (direction !== "up" && direction !== "down")) {
    return;
  }
  const examId = await moveQuestion(questionId, direction);
  if (examId) {
    revalidatePath(`/admin/provas/${examId}`);
  }
}

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    return;
  }
  const questionId = field(formData, "questionId");
  if (!ID.test(questionId)) {
    redirect("/admin");
  }
  if (field(formData, "confirmacao") !== "sim") {
    redirect(`/admin/questoes/${questionId}?erro=confirmacao`);
  }
  const outcome = await deleteQuestion(questionId);
  if (outcome.status !== "ok") {
    redirect(outcome.status === "used" ? `/admin/questoes/${questionId}?erro=em-uso` : "/admin");
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/provas/${outcome.examId}?excluida=1`);
}
