import { revalidatePath } from "next/cache";
import { addImage, type ImageError } from "@/lib/admin-images";
import { getCurrentUser } from "@/lib/dal";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

const ID = /^[a-z0-9]{10,40}$/;
const MULTIPART_OVERHEAD = 64 * 1024;

function expectedOrigin(request: Request): string {
  const configured = process.env.AUTH_URL;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function back(request: Request, questionId: string | null, result: ImageError | "ok") {
  const target = new URL(
    questionId ? `/admin/questoes/${questionId}` : "/admin",
    expectedOrigin(request),
  );
  target.searchParams.set(result === "ok" ? "imagem" : "erro", result);
  return new Response(null, { status: 303, headers: { Location: target.toString() } });
}

async function readLimited(request: Request, limit: number): Promise<Buffer | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit || !request.body) {
    return declared > limit ? null : Buffer.alloc(0);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: Request) {
  const questionParam = new URL(request.url).searchParams.get("questao");
  const questionId = questionParam && ID.test(questionParam) ? questionParam : null;
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new Response("Não encontrado", { status: 404 });
  }
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== expectedOrigin(request) || (fetchSite && fetchSite !== "same-origin")) {
    return back(request, questionId, "origem");
  }
  if (!questionId) {
    return back(request, null, "alvo");
  }
  const body = await readLimited(request, MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD);
  if (!body) {
    return back(request, questionId, "grande");
  }
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return back(request, questionId, "vazio");
  }
  const file = form.get("arquivo");
  const standardRaw = form.get("item");
  const replaceRaw = form.get("substituir");
  const captionRaw = form.get("legenda");
  const answerStandardId =
    typeof standardRaw === "string" && standardRaw !== "" ? standardRaw : null;
  const replaceAssetId = typeof replaceRaw === "string" && replaceRaw !== "" ? replaceRaw : null;
  if (
    (answerStandardId && !ID.test(answerStandardId)) ||
    (replaceAssetId && !ID.test(replaceAssetId))
  ) {
    return back(request, questionId, "alvo");
  }
  if (!(file instanceof File)) {
    return back(request, questionId, "vazio");
  }
  const error = await addImage({
    questionId,
    answerStandardId,
    replaceAssetId,
    bytes: Buffer.from(await file.arrayBuffer()),
    caption: typeof captionRaw === "string" ? captionRaw.trim() : "",
  });
  if (!error) {
    revalidatePath(`/admin/questoes/${questionId}`);
  }
  return back(request, questionId, error ?? "ok");
}
