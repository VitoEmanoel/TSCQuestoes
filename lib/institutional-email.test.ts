import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeDomains,
  emailDomain,
  googleIdentityAllowed,
  isAllowedEmail,
  parseAllowedDomains,
} from "./institutional-email";

const UESPI = ["aluno.uespi.br"];

describe("domínios permitidos", () => {
  it("lê a lista do ambiente limpando espaços, @ e valores inválidos", () => {
    assert.deepEqual(parseAllowedDomains(" @Aluno.UESPI.br, uespi.br,, lixo, a@b.com "), [
      "aluno.uespi.br",
      "uespi.br",
    ]);
    assert.deepEqual(parseAllowedDomains(undefined), []);
  });

  it("sem lista, qualquer e-mail vale", () => {
    assert.equal(isAllowedEmail("alguem@gmail.com", []), true);
  });

  it("aceita só o domínio exato, sem diferenciar maiúsculas", () => {
    assert.equal(isAllowedEmail("victor@aluno.uespi.br", UESPI), true);
    assert.equal(isAllowedEmail("VICTOR@ALUNO.UESPI.BR", UESPI), true);
    assert.equal(isAllowedEmail("victor@gmail.com", UESPI), false);
    assert.equal(isAllowedEmail("victor@uespi.br", UESPI), false);
    assert.equal(isAllowedEmail("victor@x.aluno.uespi.br", UESPI), false);
  });

  it("recusa truques: domínio real no fim, dois @, letras de outro alfabeto", () => {
    assert.equal(isAllowedEmail("victor@aluno.uespi.br.site-falso.com", UESPI), false);
    assert.equal(isAllowedEmail("victor@site-falso.com@aluno.uespi.br", UESPI), false);
    assert.equal(isAllowedEmail("victor@аluno.uespi.br", UESPI), false);
    assert.equal(emailDomain("sem-arroba"), null);
  });

  it("descreve os domínios para a mensagem da tela", () => {
    assert.equal(describeDomains(["aluno.uespi.br", "uespi.br"]), "@aluno.uespi.br ou @uespi.br");
  });
});

describe("login pelo Google", () => {
  const ok = {
    email: "victor@aluno.uespi.br",
    emailVerified: true,
    hostedDomain: "aluno.uespi.br",
  };

  it("aceita conta institucional verificada do domínio certo", () => {
    assert.equal(googleIdentityAllowed(ok, UESPI), true);
  });

  it("recusa e-mail não verificado, Gmail pessoal e conta sem domínio de organização", () => {
    assert.equal(googleIdentityAllowed({ ...ok, emailVerified: false }, UESPI), false);
    assert.equal(
      googleIdentityAllowed(
        { email: "victor@gmail.com", emailVerified: true, hostedDomain: null },
        UESPI,
      ),
      false,
    );
    assert.equal(googleIdentityAllowed({ ...ok, hostedDomain: null }, UESPI), false);
    assert.equal(googleIdentityAllowed({ ...ok, hostedDomain: "outra.edu.br" }, UESPI), false);
  });

  it("sem lista de domínios (desenvolvimento), qualquer conta Google verificada entra", () => {
    assert.equal(
      googleIdentityAllowed(
        { email: "dev@gmail.com", emailVerified: true, hostedDomain: null },
        [],
      ),
      true,
    );
    assert.equal(
      googleIdentityAllowed({ email: "dev@gmail.com", emailVerified: false }, []),
      false,
    );
  });
});
