import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  deleteUpload,
  detectImage,
  MAX_CAPTION_LENGTH,
  MAX_IMAGES_PER_TARGET,
  MAX_UPLOAD_BYTES,
  storeUpload,
} from "@/lib/uploads";

export type ImageError =
  "tipo" | "grande" | "limite" | "alvo" | "legenda" | "vazio" | "origem" | "acesso";

export const IMAGE_ERROR_MESSAGE: Record<ImageError, string> = {
  tipo: "Envie uma imagem PNG ou JPEG de verdade (até 6000 × 6000 pixels).",
  grande: "A imagem passa de 2 MB. Reduza o tamanho e tente de novo.",
  limite: `Cada enunciado ou item do padrão aceita até ${MAX_IMAGES_PER_TARGET} imagens.`,
  alvo: "Não encontrei onde anexar a imagem. Recarregue a página.",
  legenda: `A legenda pode ter até ${MAX_CAPTION_LENGTH} caracteres.`,
  vazio: "Escolha um arquivo de imagem antes de enviar.",
  origem: "Envio recusado por segurança. Recarregue a página e tente de novo.",
  acesso: "Acesso negado.",
};

async function lockQuestion(tx: Prisma.TransactionClient, questionId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Question" WHERE id = ${questionId} FOR UPDATE`;
  return rows.length > 0;
}

function targetWhere(questionId: string, answerStandardId: string | null) {
  return { questionId, answerStandardId };
}

export async function addImage(input: {
  questionId: string;
  answerStandardId: string | null;
  replaceAssetId: string | null;
  bytes: Buffer;
  caption: string;
}): Promise<ImageError | null> {
  if (input.bytes.length === 0) {
    return "vazio";
  }
  if (input.bytes.length > MAX_UPLOAD_BYTES) {
    return "grande";
  }
  if (input.caption.length > MAX_CAPTION_LENGTH) {
    return "legenda";
  }
  const info = detectImage(input.bytes);
  if (!info) {
    return "tipo";
  }
  const filePath = await storeUpload(input.bytes, info);
  let replacedPath: string | null = null;
  try {
    const outcome = await prisma.$transaction(async (tx): Promise<ImageError | null> => {
      if (!(await lockQuestion(tx, input.questionId))) {
        return "alvo";
      }
      if (input.answerStandardId) {
        const standard = await tx.answerStandard.findFirst({
          where: { id: input.answerStandardId, questionId: input.questionId },
          select: { id: true },
        });
        if (!standard) {
          return "alvo";
        }
      }
      const where = targetWhere(input.questionId, input.answerStandardId);
      if (input.replaceAssetId) {
        const replaced = await tx.asset.findFirst({
          where: { id: input.replaceAssetId, ...where },
          select: { id: true, filePath: true },
        });
        if (!replaced) {
          return "alvo";
        }
        await tx.asset.update({
          where: { id: replaced.id },
          data: { filePath, kind: "upload", ...(input.caption ? { caption: input.caption } : {}) },
        });
        replacedPath = replaced.filePath;
        return null;
      }
      const count = await tx.asset.count({ where });
      if (count >= MAX_IMAGES_PER_TARGET) {
        return "limite";
      }
      const last = await tx.asset.findFirst({
        where,
        orderBy: { position: "desc" },
        select: { position: true },
      });
      await tx.asset.create({
        data: {
          ...where,
          kind: "upload",
          filePath,
          caption: input.caption || null,
          position: (last?.position ?? -1) + 1,
        },
      });
      return null;
    });
    if (outcome) {
      await deleteUpload(filePath);
      return outcome;
    }
  } catch (error) {
    await deleteUpload(filePath);
    throw error;
  }
  if (replacedPath) {
    await deleteUpload(replacedPath);
  }
  return null;
}

async function ownedAsset(tx: Prisma.TransactionClient, questionId: string, assetId: string) {
  if (!(await lockQuestion(tx, questionId))) {
    return null;
  }
  return tx.asset.findFirst({
    where: { id: assetId, questionId },
    select: { id: true, filePath: true, answerStandardId: true, position: true },
  });
}

export async function removeImage(questionId: string, assetId: string): Promise<boolean> {
  const removed = await prisma.$transaction(async (tx) => {
    const asset = await ownedAsset(tx, questionId, assetId);
    if (!asset) {
      return null;
    }
    await tx.asset.delete({ where: { id: asset.id } });
    const rest = await tx.asset.findMany({
      where: targetWhere(questionId, asset.answerStandardId),
      orderBy: [{ position: "asc" }, { filePath: "asc" }],
      select: { id: true },
    });
    for (const [position, item] of rest.entries()) {
      await tx.asset.update({ where: { id: item.id }, data: { position } });
    }
    return asset.filePath;
  });
  if (removed === null) {
    return false;
  }
  await deleteUpload(removed);
  return true;
}

export async function moveImage(
  questionId: string,
  assetId: string,
  direction: "up" | "down",
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const asset = await ownedAsset(tx, questionId, assetId);
    if (!asset) {
      return false;
    }
    const siblings = await tx.asset.findMany({
      where: targetWhere(questionId, asset.answerStandardId),
      orderBy: [{ position: "asc" }, { filePath: "asc" }],
      select: { id: true },
    });
    const index = siblings.findIndex((item) => item.id === asset.id);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= siblings.length) {
      return true;
    }
    [siblings[index], siblings[swapWith]] = [siblings[swapWith], siblings[index]];
    for (const [position, item] of siblings.entries()) {
      await tx.asset.update({ where: { id: item.id }, data: { position } });
    }
    return true;
  });
}

export async function setCaption(
  questionId: string,
  assetId: string,
  caption: string,
): Promise<boolean> {
  if (caption.length > MAX_CAPTION_LENGTH) {
    return false;
  }
  return prisma.$transaction(async (tx) => {
    const asset = await ownedAsset(tx, questionId, assetId);
    if (!asset) {
      return false;
    }
    await tx.asset.update({ where: { id: asset.id }, data: { caption: caption || null } });
    return true;
  });
}
