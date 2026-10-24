import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate, formatDateTime, formatDayMonth, formatScore, plural } from "./format";

const MEIA_NOITE_UTC = new Date("2026-10-24T02:30:00Z");

describe("formatação para exibição", () => {
  it("nota com vírgula decimal e casas definidas", () => {
    assert.equal(formatScore(66.666), "66,67");
    assert.equal(formatScore(66.666, 1), "66,7");
    assert.equal(formatScore(50), "50");
  });

  it("datas no fuso de São Paulo, não no do servidor", () => {
    assert.equal(formatDateTime(MEIA_NOITE_UTC), "23/10/2026, 23:30");
    assert.equal(formatDate(MEIA_NOITE_UTC), "23/10/2026");
    assert.equal(formatDayMonth(MEIA_NOITE_UTC), "23/10");
    assert.equal(formatDayMonth(null), "");
  });

  it("singular só para 1", () => {
    assert.equal(plural(1, "questão", "questões"), "1 questão");
    assert.equal(plural(0, "questão", "questões"), "0 questões");
    assert.equal(plural(2, "questão", "questões"), "2 questões");
  });
});
