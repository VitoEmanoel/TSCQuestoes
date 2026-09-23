import "server-only";
import { open } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

const ASSETS_ROOT = resolve(process.cwd(), "public", "assets");

export type ResolvedAsset = {
  src: string;
  width: number;
  height: number;
  caption: string | null;
};

async function readPngSize(path: string): Promise<{ width: number; height: number } | null> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(24);
    await file.read(header, 0, 24, 0);
    if (header.readUInt32BE(12) !== 0x49484452) {
      return null;
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    await file.close();
  }
}

export async function resolveAssets(
  assets: { filePath: string; caption: string | null }[],
): Promise<ResolvedAsset[]> {
  const resolved = await Promise.all(
    assets.map(async (asset) => {
      const absolute = resolve(join(ASSETS_ROOT, asset.filePath));
      if (!absolute.startsWith(ASSETS_ROOT + sep) || !absolute.endsWith(".png")) {
        return null;
      }
      const size = await readPngSize(absolute).catch(() => null);
      if (!size) {
        return null;
      }
      return {
        src: `/assets/${asset.filePath.split(sep).join("/")}`,
        ...size,
        caption: asset.caption,
      };
    }),
  );
  return resolved.filter((asset): asset is ResolvedAsset => asset !== null);
}
