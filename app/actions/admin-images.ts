"use server";

import { revalidatePath } from "next/cache";
import { moveImage, removeImage, setCaption } from "@/lib/admin-images";
import { getCurrentUser } from "@/lib/dal";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function adminOnly(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && user.role === "ADMIN");
}

export async function removeImageAction(formData: FormData): Promise<void> {
  if (!(await adminOnly())) {
    return;
  }
  const questionId = field(formData, "questionId");
  if (await removeImage(questionId, field(formData, "assetId"))) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
}

export async function moveImageAction(formData: FormData): Promise<void> {
  if (!(await adminOnly())) {
    return;
  }
  const questionId = field(formData, "questionId");
  const direction = field(formData, "direcao");
  if (direction !== "up" && direction !== "down") {
    return;
  }
  if (await moveImage(questionId, field(formData, "assetId"), direction)) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
}

export async function captionImageAction(formData: FormData): Promise<void> {
  if (!(await adminOnly())) {
    return;
  }
  const questionId = field(formData, "questionId");
  if (await setCaption(questionId, field(formData, "assetId"), field(formData, "legenda").trim())) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
}
