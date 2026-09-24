"use client";

import Image from "next/image";
import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;
const MIN_FRACTION = 0.03;
const FULL = { x: 0, y: 0, w: 1, h: 1 };

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";
type Source = { src: string; width: number; height: number };

const SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-60";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function applyDrag(start: Rect, handle: Handle, dx: number, dy: number): Rect {
  if (handle === "move") {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
    };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (handle === "nw" || handle === "sw") left = clamp(left + dx, 0, right - MIN_FRACTION);
  if (handle === "ne" || handle === "se") right = clamp(right + dx, left + MIN_FRACTION, 1);
  if (handle === "nw" || handle === "ne") top = clamp(top + dy, 0, bottom - MIN_FRACTION);
  if (handle === "sw" || handle === "se") bottom = clamp(bottom + dy, top + MIN_FRACTION, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

async function cropToFile(image: HTMLImageElement, rect: Rect): Promise<File> {
  const sx = Math.round(rect.x * image.naturalWidth);
  const sy = Math.round(rect.y * image.naturalHeight);
  const sw = Math.max(1, Math.round(rect.w * image.naturalWidth));
  const sh = Math.max(1, Math.round(rect.h * image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sw, sh);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const encode = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  let blob = await encode("image/png");
  let name = "recorte.png";
  if (!blob || blob.size > MAX_BYTES) {
    blob = await encode("image/jpeg", 0.9);
    name = "recorte.jpg";
  }
  if (!blob) {
    throw new Error("blob");
  }
  return new File([blob], name, { type: blob.type });
}

function CropArea({
  source,
  rect,
  onChange,
  imageRef,
}: {
  source: Source;
  rect: Rect;
  onChange: (rect: Rect) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Rect } | null>(null);

  const begin = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = (event.currentTarget.dataset.handle ?? "move") as Handle;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, start: rect };
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!drag.current || !box || box.width === 0 || box.height === 0) {
      return;
    }
    const dx = (event.clientX - drag.current.x) / box.width;
    const dy = (event.clientY - drag.current.y) / box.height;
    onChange(applyDrag(drag.current.start, drag.current.handle, dx, dy));
  };
  const end = () => {
    drag.current = null;
  };
  const corner = "absolute h-5 w-5 rounded-full border-2 border-white bg-accent shadow touch-none";

  return (
    <div ref={boxRef} className="relative inline-block max-w-full touch-none select-none">
      <Image
        ref={imageRef}
        src={source.src}
        width={source.width}
        height={source.height}
        unoptimized
        alt="Imagem a recortar"
        draggable={false}
        className="block h-auto max-h-[60vh] w-auto max-w-full"
      />
      <div
        role="presentation"
        data-handle="move"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="border-accent absolute cursor-move touch-none border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.w * 100}%`,
          height: `${rect.h * 100}%`,
        }}
      >
        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
          <span
            key={handle}
            data-handle={handle}
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className={`${corner} ${handle.includes("n") ? "-top-2.5" : "-bottom-2.5"} ${handle.includes("w") ? "-left-2.5" : "-right-2.5"} ${handle === "nw" || handle === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function ImageCropUpload({
  action,
  answerStandardId,
  replaceAssetId,
  existing,
  captionMaxLength,
}: {
  action: string;
  answerStandardId: string | null;
  replaceAssetId?: string;
  existing?: Source;
  captionMaxLength: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [rect, setRect] = useState<Rect>(FULL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) {
      setSource(null);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      setSource({ src: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height });
      bitmap.close();
      setRect(FULL);
    } catch {
      setError("Não consegui abrir esse arquivo como imagem.");
      setSource(null);
    }
  };

  const send = async (useCrop: boolean) => {
    const form = formRef.current;
    const input = fileRef.current;
    const image = imageRef.current;
    if (!form || !input) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (useCrop && image) {
        const file = await cropToFile(image, rect);
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
      }
      form.requestSubmit();
    } catch {
      setBusy(false);
      setError("Não foi possível recortar a imagem. Tente de novo.");
    }
  };

  const editing = source !== null;
  const isFull = rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1;

  return (
    <form
      ref={formRef}
      action={action}
      method="post"
      encType="multipart/form-data"
      className="flex flex-col gap-3"
    >
      {answerStandardId ? <input type="hidden" name="item" value={answerStandardId} /> : null}
      {replaceAssetId ? <input type="hidden" name="substituir" value={replaceAssetId} /> : null}
      {existing ? (
        <input ref={fileRef} type="file" name="arquivo" hidden tabIndex={-1} aria-hidden="true" />
      ) : (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Adicionar imagem (PNG ou JPEG, até 2 MB)</span>
          <input
            ref={fileRef}
            type="file"
            name="arquivo"
            accept="image/png,image/jpeg"
            required
            onChange={(event) => pick(event.target.files?.[0])}
            className="min-h-6 text-sm"
          />
        </label>
      )}
      {existing && !editing ? (
        <button
          type="button"
          onClick={() => setSource(existing)}
          className={`${SECONDARY} self-start`}
        >
          Recortar
        </button>
      ) : null}
      {editing ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Arraste o retângulo para mover e os cantos para ajustar. O que ficar fora é descartado.
          </p>
          <CropArea source={source} rect={rect} onChange={setRect} imageRef={imageRef} />
        </div>
      ) : null}
      {!existing ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Legenda (opcional)</span>
          <input
            name="legenda"
            maxLength={captionMaxLength}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => send(true)} className={PRIMARY}>
            {busy ? "Enviando..." : existing ? "Salvar recorte" : "Enviar recorte"}
          </button>
          {!isFull ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRect(FULL)}
              className={SECONDARY}
            >
              Desfazer recorte
            </button>
          ) : null}
          {existing ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setSource(null)}
              className={SECONDARY}
            >
              Cancelar
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => send(false)} className={SECONDARY}>
              Enviar a imagem inteira
            </button>
          )}
        </div>
      ) : existing ? null : (
        <button type="submit" className={`${PRIMARY} self-start`}>
          Enviar imagem
        </button>
      )}
    </form>
  );
}
