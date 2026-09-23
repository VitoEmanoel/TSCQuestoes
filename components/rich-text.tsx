import Image from "next/image";
import type { ResolvedAsset } from "@/lib/assets";
import { parseRichText } from "@/lib/rich-text";

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Figure({ asset, description }: { asset: ResolvedAsset; description?: string }) {
  const alt = description || asset.caption || "Imagem da questão";
  return (
    <figure className="my-2 flex flex-col items-center gap-1">
      <Image
        src={asset.src}
        width={asset.width}
        height={asset.height}
        alt={alt}
        sizes="(max-width: 768px) 100vw, 768px"
        unoptimized={asset.uploaded}
        className="h-auto max-w-full rounded border border-zinc-200 bg-white dark:border-zinc-700"
      />
      {asset.caption ? (
        <figcaption className="text-xs text-zinc-500">{asset.caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function RichText({
  source,
  assets = [],
  className = "",
}: {
  source: string;
  assets?: ResolvedAsset[];
  className?: string;
}) {
  const blocks = parseRichText(source);
  const used = new Set<number>();

  return (
    <div className={`flex flex-col gap-3 leading-relaxed ${className}`}>
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-sm leading-snug text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.kind === "table") {
          return (
            <div key={index} className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {block.header.map((cell, cellIndex) => (
                      <th
                        key={cellIndex}
                        className="border border-zinc-300 bg-zinc-50 px-2 py-1 text-left font-semibold dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <InlineText text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="border border-zinc-300 px-2 py-1 align-top dark:border-zinc-700"
                        >
                          <InlineText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "remaining-images") {
          const pending = assets
            .map((asset, assetIndex) => ({ asset, assetIndex }))
            .filter(({ assetIndex }) => !used.has(assetIndex));
          pending.forEach(({ assetIndex }) => used.add(assetIndex));
          return (
            <div key={index} className="flex flex-col gap-2">
              {pending.map(({ asset, assetIndex }) => (
                <Figure key={assetIndex} asset={asset} />
              ))}
            </div>
          );
        }
        if (block.kind === "image") {
          const asset = assets[block.index];
          if (!asset) {
            return null;
          }
          used.add(block.index);
          return <Figure key={index} asset={asset} description={block.description} />;
        }
        return (
          <p key={index} className="whitespace-pre-line">
            <InlineText text={block.text} />
          </p>
        );
      })}
      {assets.map((asset, index) =>
        used.has(index) ? null : <Figure key={`extra-${index}`} asset={asset} />,
      )}
    </div>
  );
}
