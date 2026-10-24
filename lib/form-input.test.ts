import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formText, formValue, formValues, queryValues, withoutNullCharacters } from "./form-input";

function form(entries: [string, string | Blob][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) {
    data.append(name, value);
  }
  return data;
}

describe("entrada de formulário e de endereço", () => {
  it("tira o caractere nulo, que o PostgreSQL recusa e virava erro 500", () => {
    assert.equal(withoutNullCharacters("Banco\u0000 de\u0000\u0000 Dados"), "Banco de Dados");
    assert.equal(formValue(form([["tema", "\u0000"]]), "tema"), "");
    assert.deepEqual(queryValues(["a\u0000", "b"]), ["a", "b"]);
  });

  it("campo ausente: formValue devolve null e formText devolve texto vazio", () => {
    assert.equal(formValue(form([]), "nome"), null);
    assert.equal(formText(form([]), "nome"), "");
  });

  it("arquivo no lugar de texto não é tratado como texto", () => {
    const data = form([
      ["nome", new Blob(["x"])],
      ["ano", "2021"],
      ["ano", new Blob(["y"])],
    ]);
    assert.equal(formValue(data, "nome"), null);
    assert.deepEqual(formValues(data, "ano"), ["2021"]);
  });

  it("texto comum, acentos e quebras de linha passam sem mudança", () => {
    const texto = "Questão 1\r\nResposta: ação, função\t(ok)";
    assert.equal(formText(form([["resposta", texto]]), "resposta"), texto);
    assert.deepEqual(queryValues(undefined), []);
    assert.deepEqual(queryValues("2014"), ["2014"]);
  });
});
