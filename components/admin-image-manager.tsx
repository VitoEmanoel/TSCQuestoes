import Image from "next/image";
import { captionImageAction, moveImageAction, removeImageAction } from "@/app/actions/admin-images";
import { resolveAssets } from "@/lib/assets";
import { MAX_CAPTION_LENGTH, MAX_IMAGES_PER_TARGET } from "@/lib/uploads";

type AssetRow = { id: string; filePath: string; caption: string | null };

const SMALL_BUTTON =
  "rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900";

export async function AdminImageManager({
  questionId,
  answerStandardId,
  title,
  assets,
}: {
  questionId: string;
  answerStandardId: string | null;
  title: string;
  assets: AssetRow[];
}) {
  const resolved = await Promise.all(
    assets.map(async (asset) => ({ asset, view: (await resolveAssets([asset]))[0] ?? null })),
  );
  const uploadAction = `/admin/imagens?questao=${encodeURIComponent(questionId)}`;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="font-semibold">{title}</h3>
      {resolved.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma imagem.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {resolved.map(({ asset, view }, index) => (
            <li
              key={asset.id}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {index + 1}
                </span>
                {view ? (
                  <Image
                    src={view.src}
                    alt={asset.caption ?? `Imagem ${index + 1}`}
                    width={view.width}
                    height={view.height}
                    unoptimized
                    className="h-auto max-h-40 w-auto max-w-[70%] rounded border border-zinc-200 bg-white object-contain dark:border-zinc-700"
                  />
                ) : (
                  <span className="text-sm text-red-700 dark:text-red-400">
                    Arquivo da imagem não encontrado.
                  </span>
                )}
              </div>
              <form action={captionImageAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="questionId" value={questionId} />
                <input type="hidden" name="assetId" value={asset.id} />
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                  <span className="font-medium">Legenda (opcional)</span>
                  <input
                    name="legenda"
                    defaultValue={asset.caption ?? ""}
                    maxLength={MAX_CAPTION_LENGTH}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <button type="submit" className={SMALL_BUTTON}>
                  Salvar legenda
                </button>
              </form>
              <div className="flex flex-wrap items-center gap-2">
                <form action={moveImageAction}>
                  <input type="hidden" name="questionId" value={questionId} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="direcao" value="up" />
                  <button type="submit" disabled={index === 0} className={SMALL_BUTTON}>
                    ↑ Subir
                  </button>
                </form>
                <form action={moveImageAction}>
                  <input type="hidden" name="questionId" value={questionId} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="direcao" value="down" />
                  <button
                    type="submit"
                    disabled={index === resolved.length - 1}
                    className={SMALL_BUTTON}
                  >
                    ↓ Descer
                  </button>
                </form>
                <form action={removeImageAction}>
                  <input type="hidden" name="questionId" value={questionId} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <button
                    type="submit"
                    className={`${SMALL_BUTTON} text-red-700 dark:text-red-400`}
                  >
                    Remover
                  </button>
                </form>
                <form
                  action={uploadAction}
                  method="post"
                  encType="multipart/form-data"
                  className="flex flex-wrap items-center gap-2"
                >
                  {answerStandardId ? (
                    <input type="hidden" name="item" value={answerStandardId} />
                  ) : null}
                  <input type="hidden" name="substituir" value={asset.id} />
                  <input
                    type="file"
                    name="arquivo"
                    accept="image/png,image/jpeg"
                    required
                    aria-label={`Novo arquivo para a imagem ${index + 1}`}
                    className="min-h-6 max-w-56 text-xs"
                  />
                  <button type="submit" className={SMALL_BUTTON}>
                    Substituir
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ol>
      )}
      {resolved.length < MAX_IMAGES_PER_TARGET ? (
        <form
          action={uploadAction}
          method="post"
          encType="multipart/form-data"
          className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
        >
          {answerStandardId ? <input type="hidden" name="item" value={answerStandardId} /> : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Adicionar imagem (PNG ou JPEG, até 2 MB)</span>
            <input
              type="file"
              name="arquivo"
              accept="image/png,image/jpeg"
              required
              className="min-h-6 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Legenda (opcional)</span>
            <input
              name="legenda"
              maxLength={MAX_CAPTION_LENGTH}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Enviar imagem
          </button>
        </form>
      ) : (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Limite de {MAX_IMAGES_PER_TARGET} imagens atingido.
        </p>
      )}
    </section>
  );
}
