import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { QuestionDraft } from "./parsers/types";
import { loadDrafts, validateDraft, validateYears } from "./validate";

const years = readdirSync(join(process.cwd(), "scripts/extract/drafts")).filter((name) =>
  /^\d{4}$/.test(name),
);

function errorsOf(file: string, draft: QuestionDraft): string[] {
  return validateDraft(file, draft)
    .filter((issue) => issue.level === "error")
    .map((issue) => issue.message);
}

function sample(type: "OBJECTIVE" | "DISCURSIVE") {
  const found = loadDrafts("2021").find(
    ({ draft }) => draft.type === type && draft.status === "VALID" && draft.assets.length === 0,
  )!;
  return { file: found.file, draft: structuredClone(found.draft) };
}

describe("rascunhos das provas", () => {
  it("as 5 provas versionadas passam na validação sem erro", () => {
    assert.equal(years.length, 5);
    const errors = validateYears(years).filter((issue) => issue.level === "error");
    assert.deepEqual(errors, []);
  });

  it("a validação pega erros plantados numa objetiva", () => {
    const { file, draft } = sample("OBJECTIVE");
    assert.deepEqual(errorsOf(file, draft), []);
    const twoCorrect = structuredClone(draft);
    twoCorrect.options[0].isCorrect = true;
    twoCorrect.options[1].isCorrect = true;
    assert.ok(errorsOf(file, twoCorrect).some((message) => message.includes("exatamente 1")));
    const fourOptions = structuredClone(draft);
    fourOptions.options.pop();
    assert.ok(errorsOf(file, fourOptions).some((message) => message.includes("5 alternativas")));
    const privateChar = structuredClone(draft);
    privateChar.statementMd += " ";
    assert.ok(errorsOf(file, privateChar).some((message) => message.includes("uso privado")));
    const openFence = structuredClone(draft);
    openFence.statementMd += "\n```\ncodigo";
    assert.ok(errorsOf(file, openFence).some((message) => message.includes("sem fechamento")));
    const spacedTable = structuredClone(draft);
    spacedTable.statementMd += "\nNome     Idade     Cidade\nAna      20        Recife\n";
    assert.ok(errorsOf(file, spacedTable).some((message) => message.includes("tabela")));
    const marker = structuredClone(draft);
    marker.statementMd += "\n\n(ver imagem anexa: gráfico)";
    assert.ok(errorsOf(file, marker).some((message) => message.includes("marcadores de imagem")));
    const empty = structuredClone(draft);
    empty.statementMd = "  ";
    assert.ok(errorsOf(file, empty).some((message) => message.includes("vazio")));
  });

  it("a validação pega erros plantados numa discursiva", () => {
    const { file, draft } = sample("DISCURSIVE");
    assert.deepEqual(errorsOf(file, draft), []);
    const noStandard = structuredClone(draft);
    noStandard.answerStandards = [];
    assert.ok(errorsOf(file, noStandard).some((message) => message.includes("answerStandard")));
    const withOptions = structuredClone(draft);
    withOptions.options = [{ letter: "A", textMd: "x", isCorrect: false }];
    assert.ok(errorsOf(file, withOptions).some((message) => message.includes("options")));
  });
});
