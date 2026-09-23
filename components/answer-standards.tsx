import { RichText } from "@/components/rich-text";
import type { ResolvedAsset } from "@/lib/assets";

export type StandardView = {
  id: string;
  subItem: string | null;
  maxScore: number | null;
  criteriaMd: string;
  resolvedAssets: ResolvedAsset[];
};

export function formatPoints(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${formatted} ${value === 1 ? "ponto" : "pontos"}`;
}

export function AnswerStandards({ standards }: { standards: StandardView[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-semibold">Padrão de resposta oficial</h2>
      {standards.map((standard) => (
        <div key={standard.id} className="flex flex-col gap-2">
          {standard.subItem || standard.maxScore !== null ? (
            <h3 className="font-medium">
              {standard.subItem ? `Item ${standard.subItem})` : "Resposta esperada"}
              {standard.maxScore !== null ? (
                <span className="font-normal text-zinc-600 dark:text-zinc-400">
                  {" "}
                  — {formatPoints(standard.maxScore)}
                </span>
              ) : null}
            </h3>
          ) : null}
          {standard.criteriaMd.trim() || standard.resolvedAssets.length > 0 ? (
            <RichText source={standard.criteriaMd} assets={standard.resolvedAssets} />
          ) : (
            <p className="text-zinc-600 italic dark:text-zinc-400">
              O INEP não publicou padrão de resposta para esta questão. Compare sua resposta com o
              enunciado e se autoavalie pelos critérios pedidos nele.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
