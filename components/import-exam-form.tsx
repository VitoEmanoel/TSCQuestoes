"use client";

import { type ChangeEvent, useActionState, useState } from "react";
import { importExamAction, type ImportState } from "@/app/actions/admin-import";
import { buttonPrimary, buttonSecondary, panel, textError } from "@/components/ui";

const FIELD =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

type TextKey = "prova" | "gabarito" | "padrao";

const TEXT_FIELDS: { key: TextKey; label: string; help: string; rows: number }[] = [
  {
    key: "prova",
    label: "Texto da prova",
    help: "Copie do PDF ou use um .txt. Cada questão precisa começar com “QUESTÃO 1”, “QUESTÃO DISCURSIVA 1”…",
    rows: 14,
  },
  {
    key: "gabarito",
    label: "Texto do gabarito",
    help: "Uma questão por linha, por exemplo “QUESTÃO 1 B” ou “12 ANULADA”.",
    rows: 6,
  },
  {
    key: "padrao",
    label: "Padrão de resposta das discursivas (opcional)",
    help: "Blocos começando por “QUESTÃO DISCURSIVA 1”, com subitens a), b)… quando houver.",
    rows: 8,
  },
];

export function ImportExamForm({
  defaultCourse,
  limits,
}: {
  defaultCourse: string;
  limits: Record<TextKey, number>;
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importExamAction, {});
  const [year, setYear] = useState("");
  const [course, setCourse] = useState(defaultCourse);
  const [texts, setTexts] = useState<Record<TextKey, string>>({
    prova: "",
    gabarito: "",
    padrao: "",
  });
  const [changedSincePreview, setChangedSincePreview] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const setText = (key: TextKey, value: string) => {
    setTexts((current) => ({ ...current, [key]: value }));
    setChangedSincePreview(true);
  };

  const loadFile = (key: TextKey) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (file.size > limits[key] * 4) {
      setFileError(`O arquivo “${file.name}” é grande demais.`);
      return;
    }
    setFileError(null);
    setText(key, await file.text());
  };

  const preview = state.preview;
  const canCreate = Boolean(preview) && !changedSincePreview && !pending;

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Ano</span>
          <input
            name="ano"
            inputMode="numeric"
            value={year}
            onChange={(event) => {
              setYear(event.target.value);
              setChangedSincePreview(true);
            }}
            placeholder="2023"
            className={FIELD}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Curso</span>
          <input
            name="curso"
            value={course}
            onChange={(event) => {
              setCourse(event.target.value);
              setChangedSincePreview(true);
            }}
            className={FIELD}
            required
          />
        </label>
      </div>

      {TEXT_FIELDS.map((field) => (
        <div key={field.key} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`texto-${field.key}`} className="text-sm font-semibold">
              {field.label}
            </label>
            <label className="tap cursor-pointer text-xs">
              <span className="text-accent underline-offset-4 hover:underline">Carregar .txt</span>
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={loadFile(field.key)}
                className="sr-only"
              />
            </label>
          </div>
          <textarea
            id={`texto-${field.key}`}
            name={field.key}
            rows={field.rows}
            value={texts[field.key]}
            onChange={(event) => setText(field.key, event.target.value)}
            maxLength={limits[field.key]}
            className={`${FIELD} font-mono text-xs leading-relaxed`}
            aria-describedby={`ajuda-${field.key}`}
          />
          <p id={`ajuda-${field.key}`} className="text-xs text-zinc-600 dark:text-zinc-400">
            {field.help} {texts[field.key].length.toLocaleString("pt-BR")}/
            {limits[field.key].toLocaleString("pt-BR")} caracteres.
          </p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="etapa"
          value="analisar"
          disabled={pending}
          onClick={() => setChangedSincePreview(false)}
          className={buttonSecondary}
        >
          {pending ? "Analisando..." : "Analisar (não grava nada)"}
        </button>
        <button
          type="submit"
          name="etapa"
          value="criar"
          disabled={!canCreate}
          className={`${buttonPrimary} disabled:opacity-50`}
        >
          Criar prova como rascunho
        </button>
        {preview && changedSincePreview ? (
          <span className="text-alert text-sm">
            O texto mudou desde a análise: analise de novo antes de criar.
          </span>
        ) : null}
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        {fileError || state.error ? (
          <p role="alert" className={textError}>
            {fileError ?? state.error}
          </p>
        ) : null}
        {preview ? (
          <section className={`${panel} flex flex-col gap-3`}>
            <h2 className="text-lg font-semibold">Prévia da separação</h2>
            <p className="text-sm">
              {preview.total} questões encontradas: {preview.objectives} objetivas e{" "}
              {preview.discursives} discursivas
              {preview.anuladas > 0 ? `, ${preview.anuladas} anuladas no gabarito` : ""}.{" "}
              {preview.withWarnings > 0
                ? `${preview.withWarnings} precisam de atenção na revisão.`
                : "Nenhum aviso."}
            </p>
            {preview.warnings.map((warning) => (
              <p key={warning} className="text-alert text-sm">
                {warning}
              </p>
            ))}
            <ol className="flex flex-col gap-1 text-sm">
              {preview.rows.map((row) => (
                <li
                  key={row.label}
                  className={`flex flex-col gap-0.5 rounded-md px-2 py-1 ${
                    row.warnings.length > 0 ? "bg-alert/10" : ""
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{row.label}</strong>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {row.type === "OBJECTIVE" ? "Objetiva" : "Discursiva"}
                      {row.type === "OBJECTIVE"
                        ? row.anulada
                          ? " · anulada"
                          : row.correct
                            ? ` · correta ${row.correct}`
                            : " · sem correta"
                        : ` · ${row.standards} ${row.standards === 1 ? "item" : "itens"} de padrão`}
                    </span>
                    <span className="min-w-0 truncate text-zinc-500">{row.excerpt}</span>
                  </span>
                  {row.warnings.map((warning) => (
                    <span key={warning} className="text-alert">
                      {warning}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Tudo entra como rascunho. Figuras e códigos que o texto não traz são adicionados
              depois, no editor de cada questão, antes de publicar.
            </p>
          </section>
        ) : null}
      </div>
    </form>
  );
}
