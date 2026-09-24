import Image from "next/image";
import { ImageCropUpload } from "@/components/image-cropper";
import { captionImageAction, moveImageAction, removeImageAction } from "@/app/actions/admin-images";
import { resolveAssets } from "@/lib/assets";
import { MAX_CAPTION_LENGTH, MAX_IMAGES_PER_TARGET } from "@/lib/uploads";
import { buttonSmallSecondary, inputBase, inputTone, panel } from "@/components/ui";

type AssetRow = { id: string; filePath: string; caption: string | null };

const SMALL_BUTTON = `${buttonSmallSecondary} disabled:opacity-30`;

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
    <section className={`${panel} flex flex-col gap-3`}>
      <h3 className="font-semibold">{title}</h3>
      {resolved.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma imagem.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {resolved.map(({ asset, view }, index) => (
            <li
              key={asset.id}
              className="flex flex-col gap-3 border-b border-zinc-200 pb-4 last:border-b-0 last:pb-0 dark:border-zinc-800"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
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
                  <span className="text-alert text-sm">Arquivo da imagem não encontrado.</span>
                )}
              </div>
              <form action={captionImageAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="questionId" value={questionId} />
                <input type="hidden" name="assetId" value={asset.id} />
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Legenda (opcional)
                  <input
                    name="legenda"
                    defaultValue={asset.caption ?? ""}
                    maxLength={MAX_CAPTION_LENGTH}
                    className={`${inputBase} ${inputTone.default} min-h-9 text-sm`}
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
                  <button type="submit" className={`${SMALL_BUTTON} text-alert hover:bg-alert/10`}>
                    Remover
                  </button>
                </form>
                {view ? (
                  <ImageCropUpload
                    action={uploadAction}
                    answerStandardId={answerStandardId}
                    replaceAssetId={asset.id}
                    existing={{ src: view.src, width: view.width, height: view.height }}
                    captionMaxLength={MAX_CAPTION_LENGTH}
                  />
                ) : null}
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
                    className="min-h-6 max-w-56 text-xs text-zinc-600 file:mr-2 file:rounded-md file:border file:border-zinc-300 file:bg-transparent file:px-2 file:py-1 file:text-xs dark:text-zinc-400 dark:file:border-zinc-700"
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
        <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <ImageCropUpload
            action={uploadAction}
            answerStandardId={answerStandardId}
            captionMaxLength={MAX_CAPTION_LENGTH}
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Limite de {MAX_IMAGES_PER_TARGET} imagens atingido.
        </p>
      )}
    </section>
  );
}
