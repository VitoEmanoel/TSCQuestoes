import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmail } from "./auth-validation";

describe("normalização de e-mail", () => {
  it("tira espaços das pontas e passa para minúsculas", () => {
    assert.equal(normalizeEmail("  Fulano@Aluno.UESPI.br "), "fulano@aluno.uespi.br");
  });

  it("recusa caracteres de controle, que o banco rejeitaria", () => {
    assert.equal(normalizeEmail("a\u0000@b.com"), "");
    assert.equal(normalizeEmail("a@b.com\u0007"), "");
    assert.equal(normalizeEmail("a\nb@c.com"), "");
  });

  it("valor que não é texto vira vazio", () => {
    assert.equal(normalizeEmail(null), "");
  });
});
