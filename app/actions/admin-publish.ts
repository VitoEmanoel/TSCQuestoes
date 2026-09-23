"use server";

import { revalidatePath } from "next/cache";
import { bulkSetPublished, MAX_BULK, setPublished } from "@/lib/admin-publish";
import { getCurrentUser } from "@/lib/dal";

const ID = /^[a-z0-9]{10,40}$/;

export type PublishState = { error?: string; problems?: string[]; done?: "publicada" | "rascunho" };

async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && user.role === "ADMIN");
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function setPublishedAction(
  _state: PublishState,
  formData: FormData,
): Promise<PublishState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const questionId = field(formData, "questionId");
  const action = field(formData, "acao");
  if (!ID.test(questionId) || (action !== "publicar" && action !== "despublicar")) {
    return { error: "Pedido inválido." };
  }
  if (action === "despublicar" && field(formData, "confirmacao") !== "sim") {
    return { error: "Marque a confirmação para voltar a questão para rascunho." };
  }
  const outcome = await setPublished(questionId, action === "publicar");
  if (outcome.status === "missing") {
    return { error: "Questão não encontrada." };
  }
  if (outcome.status === "problems") {
    return { error: "A questão ainda tem pendências:", problems: outcome.problems };
  }
  revalidatePath(`/admin/questoes/${questionId}`);
  revalidatePath("/admin", "layout");
  return { done: action === "publicar" ? "publicada" : "rascunho" };
}

export type BulkState = {
  error?: string;
  summary?: string;
  skipped?: { label: string; problems: string[] }[];
};

export async function bulkPublishAction(_state: BulkState, formData: FormData): Promise<BulkState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const examId = field(formData, "examId");
  const action = field(formData, "acao");
  const ids = [...new Set(formData.getAll("ids").filter((value) => typeof value === "string"))];
  if (
    !ID.test(examId) ||
    (action !== "publicar" && action !== "despublicar") ||
    ids.length > MAX_BULK ||
    ids.some((id) => !ID.test(id))
  ) {
    return { error: "Pedido inválido." };
  }
  if (ids.length === 0) {
    return { error: "Marque pelo menos uma questão." };
  }
  if (action === "despublicar" && field(formData, "confirmacao") !== "sim") {
    return { error: "Marque a confirmação para voltar as questões para rascunho." };
  }
  const result = await bulkSetPublished(examId, ids, action === "publicar");
  if (!result) {
    return { error: "Alguma questão marcada não pertence a esta prova. Recarregue a página." };
  }
  revalidatePath("/admin", "layout");
  const verb = action === "publicar" ? "publicada" : "voltou para rascunho";
  const verbPlural = action === "publicar" ? "publicadas" : "voltaram para rascunho";
  const parts = [
    `${result.changed} ${result.changed === 1 ? verb : verbPlural}`,
    result.unchanged > 0 ? `${result.unchanged} já estava(m) assim` : null,
    result.skipped.length > 0 ? `${result.skipped.length} com pendência (não publicada)` : null,
  ].filter(Boolean);
  return { summary: `${parts.join(" · ")}.`, skipped: result.skipped };
}
