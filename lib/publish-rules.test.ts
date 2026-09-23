import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type PublishCandidate, publishProblems } from "./publish-rules";

function objective(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    type: "OBJECTIVE",
    status: "VALID",
    statementMd: "Enunciado",
    options: ["A", "B", "C", "D", "E"].map((letter) => ({
      letter,
      textMd: `texto ${letter}`,
      isCorrect: letter === "C",
    })),
    standards: 0,
    topics: 1,
    statementAssets: 0,
    reviewed: true,
    ...overrides,
  };
}

describe("publishProblems", () => {
  it("objetiva completa pode publicar", () => {
    assert.deepEqual(publishProblems(objective()), []);
  });

  it("questão completa mas não revisada não publica", () => {
    assert.deepEqual(publishProblems(objective({ reviewed: false })), [
      "Ainda não foi revisada: abra no editor, confira e salve.",
    ]);
  });

  it("aponta enunciado vazio, sem tema e sem correta", () => {
    const problems = publishProblems(
      objective({
        statementMd: "  ",
        topics: 0,
        options: objective().options.map((option) => ({ ...option, isCorrect: false })),
      }),
    );
    assert.deepEqual(problems, [
      "Enunciado vazio.",
      "Nenhum tema escolhido.",
      "Nenhuma alternativa marcada como correta.",
    ]);
  });

  it("anulada pode ficar sem correta, mas não com duas", () => {
    const none = objective().options.map((option) => ({ ...option, isCorrect: false }));
    assert.deepEqual(publishProblems(objective({ status: "ANULADA", options: none })), []);
    const two = objective().options.map((option) => ({
      ...option,
      isCorrect: option.letter === "A" || option.letter === "B",
    }));
    assert.deepEqual(publishProblems(objective({ status: "ANULADA", options: two })), [
      "Mais de uma alternativa marcada como correta.",
    ]);
  });

  it("alternativa faltando ou vazia", () => {
    const four = objective().options.slice(0, 4);
    assert.ok(publishProblems(objective({ options: four }))[0].includes("A, B, C, D e E"));
    const blank = objective().options.map((option) =>
      option.letter === "D" ? { ...option, textMd: " " } : option,
    );
    assert.deepEqual(publishProblems(objective({ options: blank })), ["Há alternativa sem texto."]);
  });

  it("marcador de imagem sem imagem anexada", () => {
    assert.deepEqual(
      publishProblems(
        objective({ statementMd: "Veja:\n\n(ver imagem anexa: gráfico)", statementAssets: 0 }),
      ),
      ["O texto tem 1 marcador de imagem e só 0 imagens anexadas."],
    );
    assert.deepEqual(
      publishProblems(
        objective({ statementMd: "Veja:\n\n(ver imagem anexa: gráfico)", statementAssets: 1 }),
      ),
      [],
    );
  });

  it("discursiva precisa de padrão de resposta", () => {
    const discursive = objective({ type: "DISCURSIVE", options: [], standards: 0 });
    assert.deepEqual(publishProblems(discursive), ["A discursiva não tem padrão de resposta."]);
    assert.deepEqual(publishProblems({ ...discursive, standards: 2 }), []);
  });
});
