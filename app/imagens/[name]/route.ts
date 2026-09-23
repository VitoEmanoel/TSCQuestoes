import { readUpload, UPLOAD_NAME } from "@/lib/uploads";

const CONTENT_TYPE = { png: "image/png", jpg: "image/jpeg" } as const;

export async function GET(_request: Request, ctx: RouteContext<"/imagens/[name]">) {
  const { name } = await ctx.params;
  const match = UPLOAD_NAME.exec(name);
  const bytes = match ? await readUpload(name) : null;
  if (!match || !bytes) {
    return new Response("Não encontrado", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": CONTENT_TYPE[match[1] as keyof typeof CONTENT_TYPE],
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
