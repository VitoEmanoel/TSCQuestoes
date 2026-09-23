import "server-only";
import { open } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { detectImage, uploadName, uploadRoot } from "@/lib/uploads";

const ASSETS_ROOT = resolve(process.cwd(), "public", "assets");
const HEADER_BYTES = 64 * 1024;

export type ResolvedAsset = {
  src: string;
  width: number;
  height: number;
  caption: string | null;
  uploaded: boolean;
};

async function readSize(path: string): Promise<{ width: number; height: number } | null> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await file.read(header, 0, HEADER_BYTES, 0);
    const info = detectImage(header.subarray(0, bytesRead));
    return info ? { width: info.width, height: info.height } : null;
  } finally {
    await file.close();
  }
}

async function resolveOne(asset: { filePath: string; caption: string | null }) {
  const uploaded = uploadName(asset.filePath);
  if (uploaded) {
    const size = await readSize(join(uploadRoot(), uploaded)).catch(() => null);
    return size
      ? { src: `/imagens/${uploaded}`, ...size, caption: asset.caption, uploaded: true }
      : null;
  }
  const absolute = resolve(join(ASSETS_ROOT, asset.filePath));
  if (!absolute.startsWith(ASSETS_ROOT + sep) || !absolute.endsWith(".png")) {
    return null;
  }
  const size = await readSize(absolute).catch(() => null);
  if (!size) {
    return null;
  }
  return {
    src: `/assets/${asset.filePath.split(sep).join("/")}`,
    ...size,
    caption: asset.caption,
    uploaded: false,
  };
}

export async function resolveAssets(
  assets: { filePath: string; caption: string | null }[],
): Promise<ResolvedAsset[]> {
  const resolved = await Promise.all(assets.map(resolveOne));
  return resolved.filter((asset): asset is ResolvedAsset => asset !== null);
}
