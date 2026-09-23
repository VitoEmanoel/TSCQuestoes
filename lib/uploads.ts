import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 6000;
export const MAX_IMAGES_PER_TARGET = 10;
export const MAX_CAPTION_LENGTH = 300;
export const UPLOAD_PREFIX = "uploads/";
export const UPLOAD_NAME = /^[a-f0-9]{24}\.(png|jpg)$/;

export function uploadRoot(): string {
  return resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), "storage", "uploads"));
}

export type ImageInfo = { type: "png" | "jpg"; width: number; height: number };

function pngInfo(bytes: Buffer): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) {
    return null;
  }
  if (bytes.readUInt32BE(12) !== 0x49484452) {
    return null;
  }
  return { type: "png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegInfo(bytes: Buffer): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return {
        type: "jpg",
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    if (length < 2) {
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

export function detectImage(bytes: Buffer): ImageInfo | null {
  const info = pngInfo(bytes) ?? jpegInfo(bytes);
  if (
    !info ||
    info.width < 1 ||
    info.height < 1 ||
    info.width > MAX_IMAGE_SIDE ||
    info.height > MAX_IMAGE_SIDE
  ) {
    return null;
  }
  return info;
}

export async function storeUpload(bytes: Buffer, info: ImageInfo): Promise<string> {
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  const name = `${randomBytes(12).toString("hex")}.${info.type}`;
  await writeFile(join(root, name), bytes, { flag: "wx", mode: 0o640 });
  return `${UPLOAD_PREFIX}${name}`;
}

export function uploadName(filePath: string): string | null {
  if (!filePath.startsWith(UPLOAD_PREFIX)) {
    return null;
  }
  const name = filePath.slice(UPLOAD_PREFIX.length);
  return UPLOAD_NAME.test(name) ? name : null;
}

export async function deleteUpload(filePath: string): Promise<void> {
  const name = uploadName(filePath);
  if (name) {
    await unlink(join(uploadRoot(), name)).catch(() => undefined);
  }
}

export async function readUpload(name: string): Promise<Buffer | null> {
  if (!UPLOAD_NAME.test(name)) {
    return null;
  }
  return readFile(join(uploadRoot(), name)).catch(() => null);
}
