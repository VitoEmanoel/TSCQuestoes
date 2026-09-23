import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MISSING_OPTION, parseExamText } from "./exam-import";
import { extractOptions, findHeaders, parseGabarito, sliceQuestionBlocks } from "./exam-text";

const PROVA = [
  "EXAME NACIONAL DE DESEMPENHO DOS ESTUDANTES",
  "QUESTÃO DISCURSIVA 1",
  "Leia o texto e responda.",
  "a) Explique o conceito. (valor: 5,0 pontos)",
  "b) Dê um exemplo. (valor: 5,0 pontos)",
  "Área livre",
  "QUESTÃO 01",
  "Qual é a capital do Brasil?",
  "A Rio de Janeiro.",
  "B Brasília.",
  "C São Paulo.",
  "D Salvador.",
  "E Recife.",
  "12",
  "QUESTÃO 9",
  "Assinale a alternativa sobre pilhas.",
  "A LIFO.",
  "B FIFO.",
  "C Aleatória.",
  "D Por prioridade.",
  "E Circular.",
  "QUESTÃO 10",
  "Texto sem alternativas reconhecíveis.",
  "1) primeira",
  "2) segunda",
].join("\n");

const GABARITO = [
  "QUESTÃO 1 B",
  "QUESTÃO 9 ANULADA",
  "QUESTÃO 10 C",
  "QUESTÃO 30 A",
  "QUESTÃO DISCURSIVA 1 Ver padrão",
].join("\n");

const PADRAO = [
  "QUESTÃO DISCURSIVA 1",
  "PADRÃO DE RESPOSTA",
  "a) O conceito é X.",
  "continua a explicação.",
  "b) Exemplo: Y.",
].join("\n");

describe("findHeaders e sliceQuestionBlocks", () => {
  it("reconhece objetiva, discursiva, número com zero e cabeçalho duplo", () => {
    const headers = findHeaders([
      "QUESTÃO 01",
      "QUESTÃO DISCURSIVA 3",
      "QUESTÃO 7 – DISCURSIVA",
      "QUESTÃO 11    QUESTÃO 12",
      "texto qualquer QUESTÃO 5",
    ]);
    assert.deepEqual(
      headers.map((header) => [header.label, header.type]),
      [
        ["1", "OBJECTIVE"],
        ["D3", "DISCURSIVE"],
        ["7", "DISCURSIVE"],
        ["11", "OBJECTIVE"],
        ["12", "OBJECTIVE"],
      ],
    );
  });

  it("corta o questionário de percepção que recomeça a numeração", () => {
    const lines = [];
    for (let number = 1; number <= 20; number += 1) {
      lines.push(`QUESTÃO ${number}`, `texto ${number}`);
    }
    lines.push("QUESTÃO 1", "Qual o grau de dificuldade desta prova?");
    const blocks = sliceQuestionBlocks(lines.join("\n"));
    assert.equal(blocks.size, 20);
    assert.deepEqual(blocks.get("20")?.lines, ["texto 20"]);
  });
});

describe("extractOptions e parseGabarito", () => {
  it("acha A–E mesmo com linha começando por “A ” no enunciado", () => {
    const options = extractOptions([
      "A partir do texto, assinale a correta.",
      "A um",
      "B dois",
      "continuação do B",
      "C três",
      "D quatro",
      "E cinco",
    ]);
    assert.deepEqual(
      options.map((option) => [option.letter, option.lines.join(" ")]),
      [
        ["A", "um"],
        ["B", "dois continuação do B"],
        ["C", "três"],
        ["D", "quatro"],
        ["E", "cinco"],
      ],
    );
  });

  it("lê gabarito em formatos diferentes e anuladas", () => {
    const map = parseGabarito("QUESTÃO 1 B\n2 - C\n3 ANULADA\nQUESTÃO DISCURSIVA 2 texto");
    assert.deepEqual(map.get("1"), { isAnulada: false, correctLetter: "B" });
    assert.deepEqual(map.get("2"), { isAnulada: false, correctLetter: "C" });
    assert.deepEqual(map.get("3"), { isAnulada: true, correctLetter: null });
    assert.deepEqual(map.get("D2"), { isAnulada: false, correctLetter: null });
  });
});

describe("parseExamText", () => {
  const result = parseExamText({ prova: PROVA, gabarito: GABARITO, padrao: PADRAO });
  const byLabel = new Map(result.questions.map((question) => [question.label, question]));

  it("separa as questões na ordem da prova, com tipo e área padrão do ENADE", () => {
    assert.deepEqual(
      result.questions.map((question) => [
        question.label,
        question.order,
        question.type,
        question.area,
      ]),
      [
        ["D1", 1, "DISCURSIVE", "FORMACAO_GERAL"],
        ["1", 2, "OBJECTIVE", "FORMACAO_GERAL"],
        ["9", 3, "OBJECTIVE", "COMPONENTE_ESPECIFICO"],
        ["10", 4, "OBJECTIVE", "COMPONENTE_ESPECIFICO"],
      ],
    );
  });

  it("objetiva: enunciado sem as alternativas, sem ruído e com a correta do gabarito", () => {
    const question = byLabel.get("1")!;
    assert.equal(question.statementMd, "Qual é a capital do Brasil?");
    assert.deepEqual(
      question.options.map((option) => [option.letter, option.textMd, option.isCorrect]),
      [
        ["A", "Rio de Janeiro.", false],
        ["B", "Brasília.", true],
        ["C", "São Paulo.", false],
        ["D", "Salvador.", false],
        ["E", "Recife.", false],
      ],
    );
    assert.deepEqual(question.warnings, []);
  });

  it("anulada no gabarito vira ANULADA sem correta", () => {
    const question = byLabel.get("9")!;
    assert.equal(question.status, "ANULADA");
    assert.ok(question.options.every((option) => !option.isCorrect));
  });

  it("sem alternativas reconhecíveis: marca para revisar e mantém o texto todo", () => {
    const question = byLabel.get("10")!;
    assert.ok(question.options.every((option) => option.textMd === MISSING_OPTION));
    assert.ok(question.statementMd.includes("1) primeira"));
    assert.ok(question.warnings[0].includes("5 alternativas"));
  });

  it("discursiva: valor total e padrão dividido em subitens com a pontuação de cada um", () => {
    const question = byLabel.get("D1")!;
    assert.equal(question.valuePoints, 10);
    assert.deepEqual(question.standards, [
      { subItem: "a", maxScore: 5, criteriaMd: "O conceito é X.\ncontinua a explicação." },
      { subItem: "b", maxScore: 5, criteriaMd: "Exemplo: Y." },
    ]);
  });

  it("avisa questão do gabarito que não existe na prova", () => {
    assert.ok(result.warnings.some((warning) => warning.includes("30")));
  });

  it("discursiva sem padrão colado ganha aviso e item vazio", () => {
    const withoutStandard = parseExamText({ prova: PROVA, gabarito: GABARITO, padrao: "" });
    const question = withoutStandard.questions.find((item) => item.label === "D1")!;
    assert.equal(question.standards.length, 1);
    assert.equal(question.standards[0].criteriaMd, "");
    assert.ok(question.warnings.some((warning) => warning.includes("padrão de resposta")));
  });

  it("texto sem cabeçalhos: nenhuma questão e aviso explicando o formato", () => {
    const empty = parseExamText({ prova: "texto solto", gabarito: "", padrao: "" });
    assert.equal(empty.questions.length, 0);
    assert.ok(empty.warnings[0].includes("QUESTÃO 1"));
  });

  it("aceita quebras de linha do Windows", () => {
    const windows = parseExamText({
      prova: PROVA.replace(/\n/g, "\r\n"),
      gabarito: GABARITO.replace(/\n/g, "\r\n"),
      padrao: PADRAO,
    });
    assert.equal(windows.questions.length, 4);
    assert.equal(windows.questions[1].options[1].isCorrect, true);
  });
});
