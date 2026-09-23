import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ScorableItem,
  scoreItems,
  slotsFor,
  type TopicRow,
  topicPerformance,
} from "./scoring";

let clock = 0;

function objective(questionId: string, selected: string, correct: string | null, anulada = false) {
  clock += 1;
  return {
    questionId,
    type: "OBJECTIVE",
    anulada,
    answeredAt: new Date(clock * 1000),
    selectedLetter: selected,
    correctLetter: correct,
    selfScore: null,
    maxPoints: 1,
  } satisfies ScorableItem;
}

function discursive(questionId: string, selfScore: number | null, maxPoints = 10, anulada = false) {
  clock += 1;
  return {
    questionId,
    type: "DISCURSIVE",
    anulada,
    answeredAt: new Date(clock * 1000),
    selectedLetter: null,
    correctLetter: null,
    selfScore,
    maxPoints,
  } satisfies ScorableItem;
}

describe("scoreItems", () => {
  it("conta acertos e porcentagem das objetivas válidas", () => {
    const summary = scoreItems([
      objective("q1", "A", "A"),
      objective("q2", "B", "C"),
      objective("q3", "D", "D"),
    ]);
    assert.deepEqual(summary.objectives, { correct: 2, counted: 3, anuladas: 0 });
    assert.equal(summary.percent, 66.67);
  });

  it("anulada não conta nem como acerto nem como erro", () => {
    const summary = scoreItems([
      objective("q1", "A", "A"),
      objective("q2", "B", null, true),
      objective("q3", "C", "C", true),
    ]);
    assert.deepEqual(summary.objectives, { correct: 1, counted: 1, anuladas: 2 });
    assert.equal(summary.percent, 100);
  });

  it("anulada depois da resposta sai da nota mesmo com acerto gravado", () => {
    const summary = scoreItems([objective("q1", "A", "A", true), objective("q2", "B", "C")]);
    assert.deepEqual(summary.objectives, { correct: 0, counted: 1, anuladas: 1 });
    assert.equal(summary.percent, 0);
  });

  it("só anuladas: sem porcentagem", () => {
    const summary = scoreItems([objective("q1", "A", null, true)]);
    assert.equal(summary.percent, null);
    assert.equal(summary.objectives.anuladas, 1);
  });

  it("vale só a última resposta de cada questão", () => {
    const summary = scoreItems([
      objective("q1", "B", "A"),
      objective("q1", "A", "A"),
      objective("q2", "C", "C"),
      objective("q2", "D", "C"),
    ]);
    assert.deepEqual(summary.objectives, { correct: 1, counted: 2, anuladas: 0 });
  });

  it("discursivas: soma autoavaliações válidas e separa anuladas e pendentes", () => {
    const summary = scoreItems([
      discursive("d1", 7.5),
      discursive("d2", 4, 10),
      discursive("d3", null),
      discursive("d4", 10, 10, true),
    ]);
    assert.deepEqual(summary.discursives, {
      points: 11.5,
      max: 20,
      evaluated: 2,
      unevaluated: 1,
      anuladas: 1,
    });
    assert.equal(summary.percent, null);
  });

  it("autoavaliação fora do intervalo é limitada ao máximo da questão", () => {
    const summary = scoreItems([discursive("d1", 15, 10), discursive("d2", -3, 10)]);
    assert.equal(summary.discursives.points, 10);
    assert.equal(summary.discursives.max, 20);
  });
});

describe("slotsFor", () => {
  it("um campo por subitem quando todos têm pontuação", () => {
    assert.deepEqual(
      slotsFor(10, [
        { subItem: "a", maxScore: 6 },
        { subItem: "b", maxScore: 4 },
      ]),
      [
        { key: "a", label: "Item a)", max: 6 },
        { key: "b", label: "Item b)", max: 4 },
      ],
    );
  });

  it("nota única com o valor da questão quando falta pontuação por item", () => {
    assert.deepEqual(slotsFor(8, [{ subItem: "a", maxScore: null }]), [
      { key: "total", label: "Nota", max: 8 },
    ]);
    assert.deepEqual(slotsFor(null, []), [{ key: "total", label: "Nota", max: 10 }]);
  });
});

function row(topics: string[], overrides: Partial<TopicRow> = {}): TopicRow {
  return {
    topics,
    type: "OBJECTIVE",
    anulada: false,
    answered: true,
    correct: true,
    selfScore: null,
    maxPoints: 10,
    ...overrides,
  };
}

describe("topicPerformance", () => {
  it("conta certas, erradas e em branco por tema e ordena do pior para o melhor", () => {
    const result = topicPerformance([
      row(["Redes"]),
      row(["Redes"], { correct: false }),
      row(["Redes"], { answered: false, correct: false }),
      row(["Banco de Dados"]),
      row(["Banco de Dados"]),
    ]);
    assert.deepEqual(
      result.map((entry) => [entry.topic, entry.correct, entry.wrong, entry.blank, entry.percent]),
      [
        ["Redes", 1, 1, 1, 33.33],
        ["Banco de Dados", 2, 0, 0, 100],
      ],
    );
  });

  it("questão com dois temas conta nos dois; anulada não conta em nenhum", () => {
    const result = topicPerformance([
      row(["Programação", "Estrutura de Dados"], { correct: false }),
      row(["Programação"], { anulada: true }),
    ]);
    assert.deepEqual(
      result.map((entry) => [entry.topic, entry.total, entry.wrong]),
      [
        ["Programação", 1, 1],
        ["Estrutura de Dados", 1, 1],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR")),
    );
  });

  it("discursivas somam autoavaliação e separam pendentes e em branco", () => {
    const [entry] = topicPerformance([
      row(["Engenharia"], { type: "DISCURSIVE", selfScore: 6, maxPoints: 10 }),
      row(["Engenharia"], { type: "DISCURSIVE", selfScore: null }),
      row(["Engenharia"], { type: "DISCURSIVE", answered: false }),
    ]);
    assert.equal(entry.percent, null);
    assert.deepEqual(entry.discursive, { total: 3, blank: 1, pending: 1, points: 6, max: 10 });
  });

  it("temas só com discursivas ficam depois dos que têm porcentagem", () => {
    const result = topicPerformance([
      row(["Só discursiva"], { type: "DISCURSIVE", selfScore: 1 }),
      row(["Objetiva"], { correct: true }),
    ]);
    assert.deepEqual(
      result.map((entry) => entry.topic),
      ["Objetiva", "Só discursiva"],
    );
  });
});
