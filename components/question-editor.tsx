"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { type QuestionEditorState, saveQuestionAction } from "@/app/actions/admin";
import { parseRichText } from "@/lib/rich-text";
import { buttonPrimary } from "@/components/ui";

type Standard = {
  key: string;
  id: string | null;
  subItem: string;
  maxScore: string;
  criteriaMd: string;
  assets: number;
};

type EditorQuestion = {
  id: string;
  type: "OBJECTIVE" | "DISCURSIVE";
  area: string;
  status: "VALID" | "ANULADA";
  statementMd: string;
  valuePoints: number | null;
  updatedAt: number;
  options: { letter: string; textMd: string; isCorrect: boolean }[];
  standards: {
    id: string;
    subItem: string | null;
    maxScore: number | null;
    criteriaMd: string;
    assets: number;
  }[];
  topics: string[];
  assetCount: number;
};

const FIELD =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-accent focus:ring-4 focus:ring-accent/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function numberText(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

function imageMarkers(source: string): number {
  return parseRichText(source).filter((block) => block.kind === "image").length;
}

export function QuestionEditor({
  question,
  areas,
  topics,
}: {
  question: EditorQuestion;
  areas: { value: string; label: string }[];
  topics: string[];
}) {
  const [state, action, pending] = useActionState<QuestionEditorState, FormData>(
    saveQuestionAction,
    {},
  );
  const [statementMd, setStatementMd] = useState(question.statementMd);
  const [area, setArea] = useState(question.area);
  const [status, setStatus] = useState(question.status);
  const [valuePoints, setValuePoints] = useState(numberText(question.valuePoints));
  const [options, setOptions] = useState(
    Object.fromEntries(question.options.map((option) => [option.letter, option.textMd])),
  );
  const [correct, setCorrect] = useState(
    question.options.find((option) => option.isCorrect)?.letter ?? "",
  );
  const [standards, setStandards] = useState<Standard[]>(
    question.standards.map((standard) => ({
      key: standard.id,
      id: standard.id,
      subItem: standard.subItem ?? "",
      maxScore: numberText(standard.maxScore),
      criteriaMd: standard.criteriaMd,
      assets: standard.assets,
    })),
  );
  const [chosenTopics, setChosenTopics] = useState<string[]>(question.topics);
  const [dirty, setDirty] = useState(false);
  const newKey = useRef(0);
  const markers = useMemo(() => imageMarkers(statementMd), [statementMd]);
  const isObjective = question.type === "OBJECTIVE";

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const updateStandard = (key: string, patch: Partial<Standard>) => {
    setStandards((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setDirty(true);
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="questionId" value={question.id} />
      <input type="hidden" name="updatedAt" value={question.updatedAt} />

      <section className="flex flex-col gap-2">
        <label htmlFor="statementMd" className="font-semibold">
          Enunciado
        </label>
        <textarea
          id="statementMd"
          name="statementMd"
          rows={16}
          value={statementMd}
          onChange={(event) => touch(setStatementMd)(event.target.value)}
          className={`${FIELD} font-mono leading-relaxed`}
          aria-describedby="statement-help"
        />
        <div
          id="statement-help"
          className="flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400"
        >
          <p>
            Linhas em branco separam parágrafos. Tabela: linhas começando e terminando com{" "}
            <code>|</code>. Código: entre linhas com <code>```</code>. Imagem: escreva{" "}
            <code>(ver imagem anexa: descrição)</code> onde a figura deve aparecer.
          </p>
          <p className={markers > question.assetCount ? "text-alert font-medium" : ""}>
            Marcadores de imagem no texto: {markers} · imagens anexadas: {question.assetCount}
            {markers > question.assetCount
              ? " — há marcador sem imagem; o aluno verá um aviso no lugar."
              : null}
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Área</span>
          <select
            name="area"
            value={area}
            onChange={(event) => touch(setArea)(event.target.value)}
            className={FIELD}
          >
            {areas.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Situação</span>
          <select
            name="status"
            value={status}
            onChange={(event) => touch(setStatus)(event.target.value as "VALID" | "ANULADA")}
            className={FIELD}
          >
            <option value="VALID">Válida</option>
            <option value="ANULADA">Anulada pelo INEP</option>
          </select>
        </label>
        {!isObjective ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Valor total (pontos)</span>
            <input
              name="valuePoints"
              inputMode="decimal"
              value={valuePoints}
              onChange={(event) => touch(setValuePoints)(event.target.value)}
              className={FIELD}
            />
          </label>
        ) : (
          <input type="hidden" name="valuePoints" value="" />
        )}
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Temas</legend>
        <div className="flex flex-wrap gap-2">
          {topics.map((topic) => {
            const checked = chosenTopics.includes(topic);
            return (
              <label
                key={topic}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                  checked
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                <input
                  type="checkbox"
                  name="topic"
                  value={topic}
                  checked={checked}
                  onChange={() =>
                    touch(setChosenTopics)(
                      checked
                        ? chosenTopics.filter((item) => item !== topic)
                        : [...chosenTopics, topic],
                    )
                  }
                  className="sr-only"
                />
                {topic}
              </label>
            );
          })}
        </div>
      </fieldset>

      {isObjective ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Alternativas (marque a correta)</legend>
          {question.options.map(({ letter }) => (
            <div key={letter} className="flex gap-3">
              <label className="flex shrink-0 flex-col items-center gap-1 pt-2 text-xs">
                <input
                  type="radio"
                  name="correct"
                  value={letter}
                  checked={correct === letter}
                  onChange={() => touch(setCorrect)(letter)}
                  aria-label={`Alternativa ${letter} é a correta`}
                />
                <span className="font-semibold">{letter}</span>
              </label>
              <textarea
                name={`option_${letter}`}
                rows={3}
                value={options[letter] ?? ""}
                onChange={(event) =>
                  touch(setOptions)({ ...options, [letter]: event.target.value })
                }
                aria-label={`Texto da alternativa ${letter}`}
                className={`${FIELD} w-full ${correct === letter ? "border-accent ring-accent/20 ring-2" : ""}`}
              />
            </div>
          ))}
          {status === "ANULADA" ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Questão anulada pode ficar sem alternativa correta.{" "}
              <button
                type="button"
                onClick={() => touch(setCorrect)("")}
                className="text-accent underline-offset-4 hover:underline"
              >
                Desmarcar correta
              </button>
            </p>
          ) : null}
          {correct === "" ? <input type="hidden" name="correct" value="" /> : null}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Padrão de resposta</legend>
          {standards.map((standard, index) => (
            <div
              key={standard.key}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <input type="hidden" name="standardId" value={standard.id ?? ""} />
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Subitem</span>
                  <input
                    name="standardSubItem"
                    value={standard.subItem}
                    maxLength={1}
                    onChange={(event) =>
                      updateStandard(standard.key, { subItem: event.target.value })
                    }
                    placeholder="a"
                    className={`${FIELD} w-16`}
                    aria-label={`Subitem do item ${index + 1}`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Pontos</span>
                  <input
                    name="standardMaxScore"
                    inputMode="decimal"
                    value={standard.maxScore}
                    onChange={(event) =>
                      updateStandard(standard.key, { maxScore: event.target.value })
                    }
                    className={`${FIELD} w-24`}
                    aria-label={`Pontos do item ${index + 1}`}
                  />
                </label>
                <button
                  type="button"
                  disabled={standard.assets > 0}
                  onClick={() => {
                    setStandards((list) => list.filter((item) => item.key !== standard.key));
                    setDirty(true);
                  }}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
                  title={standard.assets > 0 ? "Este item tem imagem anexada" : undefined}
                >
                  Remover item
                </button>
                {standard.assets > 0 ? (
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {standard.assets}{" "}
                    {standard.assets === 1 ? "imagem anexada" : "imagens anexadas"}
                  </span>
                ) : null}
              </div>
              <textarea
                name="standardCriteria"
                rows={8}
                value={standard.criteriaMd}
                onChange={(event) =>
                  updateStandard(standard.key, { criteriaMd: event.target.value })
                }
                className={`${FIELD} font-mono leading-relaxed`}
                aria-label={`Texto do padrão, item ${index + 1}`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              newKey.current += 1;
              setStandards((list) => [
                ...list,
                {
                  key: `novo-${newKey.current}`,
                  id: null,
                  subItem: "",
                  maxScore: "",
                  criteriaMd: "",
                  assets: 0,
                },
              ]);
              setDirty(true);
            }}
            className="self-start rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          >
            Adicionar item
          </button>
        </fieldset>
      )}

      <div className="bg-background/95 sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-zinc-200 py-3 backdrop-blur dark:border-zinc-800">
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </button>
        <span aria-live="polite" className="text-sm">
          {state.error ? (
            <span role="alert" className="text-alert">
              {state.error}
            </span>
          ) : dirty ? (
            <span className="text-zinc-600 dark:text-zinc-400">● Alterações não salvas.</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
