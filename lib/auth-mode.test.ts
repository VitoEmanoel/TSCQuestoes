import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { studentPasswordEnabled } from "./auth-mode";

const google = { AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "segredo" };

describe("login de estudante por senha", () => {
  it("fica ligado por padrão", () => {
    assert.equal(studentPasswordEnabled({ ...google }), true);
  });

  it("desliga com STUDENT_PASSWORD_AUTH=off quando o Google está configurado", () => {
    assert.equal(studentPasswordEnabled({ ...google, STUDENT_PASSWORD_AUTH: "off" }), false);
  });

  it("não desliga sem Google, para ninguém ficar sem forma de entrar", () => {
    assert.equal(studentPasswordEnabled({ STUDENT_PASSWORD_AUTH: "off" }), true);
  });
});
