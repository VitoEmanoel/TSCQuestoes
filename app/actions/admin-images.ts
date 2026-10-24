"use server";

import { revalidatePath } from "next/cache";
import { moveImage, removeImage, setCaption } from "@/lib/admin-images";
import { getCurrentUser } from "@/lib/dal";
import { formText } from "@/lib/form-input";

async function adminOnly(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user && user.role === "ADMIN");
}

export async function removeImageAction(formData: FormData): Promise<void> {
  if (!(await adminOnly())) {
    return;
  }
  const questionId = formText(formData, "questionId");
  if (await removeImage(questionId, formText(formData, "assetId"))) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
}

export async function moveImageAction(formData: FormData): Promise<void> {
  if (!(await adminOnly())) {
    return;
  }
  const questionId = formText(formData, "questionId");
  const direction = formText(formData, "direcao");
  if (direction !== "up" && direction !== "down") {
    return;
  }
  if (await moveImage(questionId, formText(formData, "assetId"), direction)) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
}

export async function captionImageAction(formData: FormData): Promise<void> {
  if (!(await adminOnly())) {
    return;
  }
  const questionId = formText(formData, "questionId");
  if (
    await setCaption(
      questionId,
      formText(formData, "assetId"),
      formText(formData, "legenda").trim(),
    )
  ) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
}
