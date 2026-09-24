import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayName, firstName } from "./person-name";

describe("nome para exibição", () => {
  it("nome todo em maiúsculas vira nome normal", () => {
    assert.equal(displayName("VICTOR EMANOEL LIMA SILVA"), "Victor Emanoel Lima Silva");
    assert.equal(firstName("VICTOR EMANOEL LIMA SILVA"), "Victor");
  });

  it("partículas ficam minúsculas, menos no começo", () => {
    assert.equal(
      displayName("MARIA DAS DORES DE SOUZA E SILVA"),
      "Maria das Dores de Souza e Silva",
    );
    assert.equal(displayName("DA COSTA JOÃO"), "Da Costa João");
  });

  it("respeita acentos, hífen e espaços sobrando", () => {
    assert.equal(displayName("  JOSÉ   ÂNGELO  "), "José Ângelo");
    assert.equal(displayName("ANA-CLARA ÍTALO"), "Ana-Clara Ítalo");
  });

  it("nome já escrito normalmente fica como está", () => {
    assert.equal(displayName("Mariana Souza"), "Mariana Souza");
    assert.equal(displayName("João da Silva"), "João da Silva");
  });

  it("vazio ou ausente vira nulo", () => {
    assert.equal(displayName(""), null);
    assert.equal(displayName(null), null);
    assert.equal(firstName(undefined), null);
  });
});
