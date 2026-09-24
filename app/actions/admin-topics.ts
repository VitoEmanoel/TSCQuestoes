"use server";

import { revalidatePath } from "next/cache";
import {
  createTopic,
  deleteTopic,
  normalizeTopicName,
  renameTopic,
  type TopicOutcome,
} from "@/lib/admin-topics";
import { getCurrentUser } from "@/lib/dal";

const ID = /^[a-z0-9]{10,40}$/;
const CATEGORIES = ["Componente Específico", "Formação Geral"];

export type TopicState = { error?: string; saved?: string };

const MESSAGES: Record<Exclude<TopicOutcome, "ok">, string> = {
  duplicate: "Já existe um tema com esse nome.",
  protected:
    "O tema “Formação Geral” é usado automaticamente pelo sistema e não pode ser alterado.",
  used: "Este tema está em questões. Tire-o das questões antes de excluir.",
  missing: "Tema não encontrado. Recarregue a página.",
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && user.role === "ADMIN");
}

const INVALID_NAME =
  "Nome inválido: de 2 a 60 caracteres, com letras, números, espaços e pontuação simples.";

export async function createTopicAction(
  _state: TopicState,
  formData: FormData,
): Promise<TopicState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const name = normalizeTopicName(field(formData, "nome"));
  const category = field(formData, "categoria");
  if (!name) {
    return { error: INVALID_NAME };
  }
  if (!CATEGORIES.includes(category)) {
    return { error: "Categoria inválida." };
  }
  const outcome = await createTopic(name, category);
  if (outcome !== "ok") {
    return { error: MESSAGES[outcome] };
  }
  revalidatePath("/admin/temas");
  return { saved: `Tema “${name}” criado.` };
}

export async function renameTopicAction(
  _state: TopicState,
  formData: FormData,
): Promise<TopicState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const id = field(formData, "topicId");
  const name = normalizeTopicName(field(formData, "nome"));
  if (!ID.test(id)) {
    return { error: MESSAGES.missing };
  }
  if (!name) {
    return { error: INVALID_NAME };
  }
  const outcome = await renameTopic(id, name);
  if (outcome !== "ok") {
    return { error: MESSAGES[outcome] };
  }
  revalidatePath("/", "layout");
  return { saved: `Renomeado para “${name}”.` };
}

export async function deleteTopicAction(
  _state: TopicState,
  formData: FormData,
): Promise<TopicState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const id = field(formData, "topicId");
  if (!ID.test(id)) {
    return { error: MESSAGES.missing };
  }
  const outcome = await deleteTopic(id);
  if (outcome !== "ok") {
    return { error: MESSAGES[outcome] };
  }
  revalidatePath("/admin/temas");
  return { saved: "Tema excluído." };
}
