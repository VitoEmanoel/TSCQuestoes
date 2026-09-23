"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createExamFromImport, deleteDraftExam } from "@/lib/admin-import";
import { getCurrentUser } from "@/lib/dal";
import { IMPORT_LIMITS, parseExamText } from "@/lib/exam-import";

const ID = /^[a-z0-9]{10,40}$/;

export type ImportPreviewRow = {
  label: string;
  type: "OBJECTIVE" | "DISCURSIVE";
  anulada: boolean;
  correct: string | null;
  optionsOk: boolean;
  standards: number;
  excerpt: string;
  warnings: string[];
};

export type ImportState = {
  error?: string;
  preview?: {
    total: number;
    objectives: number;
    discursives: number;
    anuladas: number;
    withWarnings: number;
    warnings: string[];
    rows: ImportPreviewRow[];
  };
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && user.role === "ADMIN");
}

export async function importExamAction(
  _state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  if (!(await isAdmin())) {
    return { error: "Acesso negado." };
  }
  const step = text(formData, "etapa");
  const year = Number(text(formData, "ano"));
  const course = text(formData, "curso").trim();
  const prova = text(formData, "prova");
  const gabarito = text(formData, "gabarito");
  const padrao = text(formData, "padrao");
  if (step !== "analisar" && step !== "criar") {
    return { error: "Pedido inválido." };
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Informe o ano da prova (entre 2000 e 2100)." };
  }
  if (course.length < 3 || course.length > 150) {
    return { error: "Informe o nome do curso (de 3 a 150 caracteres)." };
  }
  if (prova.trim().length === 0) {
    return { error: "Cole o texto da prova." };
  }
  if (
    prova.length > IMPORT_LIMITS.prova ||
    gabarito.length > IMPORT_LIMITS.gabarito ||
    padrao.length > IMPORT_LIMITS.padrao
  ) {
    return {
      error: `Texto grande demais (prova até ${IMPORT_LIMITS.prova.toLocaleString("pt-BR")} caracteres, gabarito até ${IMPORT_LIMITS.gabarito.toLocaleString("pt-BR")}, padrão até ${IMPORT_LIMITS.padrao.toLocaleString("pt-BR")}).`,
    };
  }
  const result = parseExamText({ prova, gabarito, padrao });
  if (result.questions.length === 0) {
    return { error: result.warnings.join(" ") || "Nenhuma questão encontrada." };
  }
  if (step === "analisar") {
    const rows = result.questions.map((question) => ({
      label: question.label,
      type: question.type,
      anulada: question.status === "ANULADA",
      correct: question.options.find((option) => option.isCorrect)?.letter ?? null,
      optionsOk:
        question.type === "OBJECTIVE"
          ? !question.warnings.some((w) => w.includes("5 alternativas"))
          : true,
      standards: question.standards.length,
      excerpt: question.statementMd.replace(/\s+/g, " ").slice(0, 140),
      warnings: question.warnings,
    }));
    return {
      preview: {
        total: rows.length,
        objectives: rows.filter((row) => row.type === "OBJECTIVE").length,
        discursives: rows.filter((row) => row.type === "DISCURSIVE").length,
        anuladas: rows.filter((row) => row.anulada).length,
        withWarnings: rows.filter((row) => row.warnings.length > 0).length,
        warnings: result.warnings,
        rows,
      },
    };
  }
  const outcome = await createExamFromImport({ year, course, questions: result.questions });
  if (outcome.status === "exists") {
    return {
      error: `Já existe uma prova de ${year} para este curso. Edite as questões dela pelo painel ou exclua-a antes (só é possível se nada estiver publicado).`,
    };
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/provas/${outcome.examId}?importada=1`);
}

export async function deleteExamAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) {
    return;
  }
  const examId = text(formData, "examId");
  if (!ID.test(examId) || text(formData, "confirmacao") !== "sim") {
    redirect(ID.test(examId) ? `/admin/provas/${examId}?erro=confirmacao` : "/admin");
  }
  if (!(await deleteDraftExam(examId))) {
    redirect(`/admin/provas/${examId}?erro=exclusao`);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin?excluida=1");
}
