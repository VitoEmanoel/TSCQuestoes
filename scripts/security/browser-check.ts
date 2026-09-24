import "dotenv/config";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { findChrome, openPage, sleep } from "./cdp";

const BASE = process.env.ATTACK_BASE_URL ?? "http://localhost:3123";
const DEBUG_PORT = 9333;
const EVIL_PORT = 8765;
const prisma = new PrismaClient();
const TEST_EMAIL = "navegador@ataque.local";
const TEST_PASSWORD = "senhaNavegador1";

type LogEntry = { phase: string; text: string };
const logs: LogEntry[] = [];
const results: { name: string; ok: boolean; detail: string }[] = [];
let phase = "início";

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function cspViolations(phaseName: string): LogEntry[] {
  return logs.filter(
    (entry) =>
      entry.phase === phaseName &&
      /Content Security Policy|Refused to|X-Frame-Options|frame-ancestors/i.test(entry.text),
  );
}

function jsErrors(phaseName: string): LogEntry[] {
  return logs.filter((entry) => entry.phase === phaseName && entry.text.startsWith("EXCEÇÃO"));
}

function startEvilSite(): Server {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (request.url === "/inofensivo") {
      response.end("<!doctype html><title>Página sem proteção</title><p>conteúdo qualquer</p>");
      return;
    }
    if (request.url === "/controle") {
      response.end(
        `<!doctype html><title>Controle</title>` +
          `<iframe id="alvo" src="http://127.0.0.1:${EVIL_PORT}/inofensivo"></iframe>`,
      );
      return;
    }
    response.end(
      `<!doctype html><title>Site do atacante</title><h1>Ganhe um prêmio!</h1>` +
        `<iframe id="alvo" src="${BASE}/login" width="600" height="400"></iframe>`,
    );
  });
  server.listen(EVIL_PORT);
  return server;
}

const DRAFT_LABEL = "RASCUNHO-NAVEGADOR";
const TEST_COURSE = "Curso de Teste do Navegador";

async function removeTestUser() {
  const drafts = { originalLabel: DRAFT_LABEL };
  const uploadRoot = process.env.UPLOAD_DIR ?? join(process.cwd(), "storage", "uploads");
  for (const asset of await prisma.asset.findMany({
    where: { question: drafts },
    select: { filePath: true },
  })) {
    const name = asset.filePath.startsWith("uploads/") ? asset.filePath.slice(8) : "";
    if (/^[a-f0-9]{24}\.(png|jpg)$/.test(name) && existsSync(join(uploadRoot, name))) {
      unlinkSync(join(uploadRoot, name));
    }
  }
  await prisma.asset.deleteMany({ where: { question: drafts } });
  await prisma.attemptItem.deleteMany({ where: { question: drafts } });
  const testExams = { exam: { course: TEST_COURSE } };
  await prisma.option.deleteMany({ where: { question: testExams } });
  await prisma.answerStandard.deleteMany({ where: { question: testExams } });
  await prisma.questionTag.deleteMany({ where: { question: testExams } });
  await prisma.question.deleteMany({ where: testExams });
  await prisma.exam.deleteMany({ where: { course: TEST_COURSE } });
  await prisma.option.deleteMany({ where: { question: drafts } });
  await prisma.questionTag.deleteMany({ where: { question: drafts } });
  await prisma.question.deleteMany({ where: drafts });
  await prisma.attemptItem.deleteMany({ where: { attempt: { user: { email: TEST_EMAIL } } } });
  await prisma.attempt.deleteMany({ where: { user: { email: TEST_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
}

async function main() {
  await removeTestUser();
  await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Teste do Navegador",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
    },
  });
  const profile = mkdtempSync(join(tmpdir(), "tscq-chrome-"));
  const chrome: ChildProcess = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const evil = startEvilSite();

  try {
    const page = await openPage(DEBUG_PORT);
    page.on((method, params) => {
      if (method === "Log.entryAdded") {
        const entry = params.entry as { text: string; url?: string };
        logs.push({ phase, text: `${entry.text} ${entry.url ?? ""}`.trim() });
      }
      if (method === "Runtime.exceptionThrown") {
        const details = params.exceptionDetails as {
          text: string;
          exception?: { description?: string };
        };
        logs.push({ phase, text: `EXCEÇÃO ${details.exception?.description ?? details.text}` });
      }
      if (method === "Audits.issueAdded") {
        const issue = params.issue as { code: string; details: unknown };
        if (issue.code === "ContentSecurityPolicyIssue") {
          logs.push({ phase, text: `Content Security Policy ${JSON.stringify(issue.details)}` });
        }
      }
    });
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Page.enable");
    await page.send("Audits.enable");

    phase = "páginas públicas";
    for (const path of ["/", "/login", "/cadastro"]) {
      await page.goto(BASE + path);
    }
    const hydrated = await page.evaluate<boolean>(
      "Object.keys(document.querySelector('main form')).some((key) => key.startsWith('__react'))",
    );
    check("React hidratou o formulário de cadastro sob o CSP", hydrated);
    check(
      "páginas públicas: nenhuma violação de CSP",
      cspViolations(phase).length === 0,
      cspViolations(phase)
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );
    check(
      "páginas públicas: nenhum erro de JavaScript",
      jsErrors(phase).length === 0,
      jsErrors(phase)
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "login pelo navegador";
    await page.goto(`${BASE}/login`);
    await page.evaluate(`(() => {
      document.querySelector('#email').value = ${JSON.stringify(TEST_EMAIL)};
      document.querySelector('#password').value = ${JSON.stringify(TEST_PASSWORD)};
      document.querySelector('#password').form.requestSubmit();
    })()`);
    const loggedIn = await page.waitFor(
      "document.querySelector('header')?.textContent.includes('Sair')",
      15_000,
    );
    check("login pelo formulário funciona com o CSP ativo", loggedIn);
    check(
      "login: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "navegação autenticada";
    const table = await prisma.question.findFirst({
      where: { exam: { year: 2017 }, originalLabel: "20" },
      select: { id: true },
    });
    const code = await prisma.question.findFirst({
      where: { exam: { year: 2017 }, originalLabel: "D4" },
      select: { id: true },
    });
    await page.goto(`${BASE}/questoes`);
    await page.waitFor(
      "Object.keys(document.querySelector('#tipo') ?? {}).some((key) => key.startsWith('__react'))",
      10_000,
    );
    await page.evaluate(`(() => {
      [...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith('2017')).click();
      const tipo = document.querySelector('#tipo');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(tipo, 'DISCURSIVE');
      tipo.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.waitFor("document.body.textContent.includes('Mostrar 5 questões')", 5_000);
    await page.evaluate("document.querySelector('#tipo').form.requestSubmit()");
    const filtered = await page.waitFor(
      "location.search.includes('ano=2017') && document.body.textContent.includes('5 questões encontradas')",
      10_000,
    );
    check("filtro da lista (navegação do next/form) funciona", filtered);
    await page.goto(`${BASE}/questoes/${table?.id}`, 2500);
    const images = await page.evaluate<{ total: number; loaded: number }>(
      "(() => { const imgs = [...document.querySelectorAll('main img')]; return { total: imgs.length, loaded: imgs.filter((img) => img.complete && img.naturalWidth > 0).length }; })()",
    );
    check(
      "imagens da questão carregam sob o CSP",
      images.total > 0 && images.loaded === images.total,
      `${images.loaded}/${images.total}`,
    );
    await page.goto(`${BASE}/questoes/${code?.id}`);
    check(
      "navegação autenticada: nenhuma violação de CSP",
      cspViolations(phase).length === 0,
      cspViolations(phase)
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );
    check(
      "navegação autenticada: nenhum erro de JavaScript",
      jsErrors(phase).length === 0,
      jsErrors(phase)
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "responder objetiva";
    const answerStarted = new Date();
    const objective = await prisma.question.findFirst({
      where: { exam: { year: 2017 }, originalLabel: "1" },
      select: { id: true, options: { select: { letter: true, isCorrect: true } } },
    });
    const correctLetter = objective?.options.find((option) => option.isCorrect)?.letter ?? "";
    const wrongLetter = correctLetter === "A" ? "B" : "A";
    await page.goto(`${BASE}/questoes/${objective?.id}`);
    const leaked = await page.evaluate<boolean>(
      "document.documentElement.outerHTML.includes('isCorrect') || document.body.textContent.includes('alternativa correta')",
    );
    check("antes de responder, o gabarito não está na página", !leaked);
    const focusable = await page.evaluate<boolean>(
      "(() => { const radio = document.querySelector('input[name=letter]'); radio.focus(); return document.activeElement === radio; })()",
    );
    check("alternativas alcançáveis pelo teclado", focusable);
    const choose = (letter: string) =>
      page.evaluate(`(() => {
        document.querySelector('input[name=letter][value="${letter}"]').closest('label').click();
        [...document.querySelectorAll('main button')].find((button) => button.textContent.trim() === 'Responder').click();
      })()`);
    await choose(wrongLetter);
    const wrongShown = await page.waitFor(
      `document.body.textContent.includes('Você errou. Você marcou a ${wrongLetter}; a alternativa correta é a ${correctLetter}.')`,
    );
    const colors = await page.evaluate<{
      chosen: string;
      right: string;
      disabled: boolean;
    }>(`(() => {
      const label = (letter) => document.querySelector('input[name=letter][value="' + letter + '"]').closest('label').className;
      return { chosen: label("${wrongLetter}"), right: label("${correctLetter}"), disabled: document.querySelector('main fieldset').disabled };
    })()`);
    check(
      "errar: mensagem com a certa, marcada em vermelho e certa em verde",
      wrongShown &&
        colors.chosen.includes("border-red-500") &&
        colors.right.includes("border-emerald-500") &&
        colors.disabled,
    );
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((button) => button.textContent.includes('Responder de novo')).click()",
    );
    const reset = await page.waitFor(
      "!document.querySelector('main fieldset').disabled && ![...document.querySelectorAll('input[name=letter]')].some((radio) => radio.checked)",
    );
    check("'Responder de novo' libera as alternativas sem nada marcado", reset);
    await choose(correctLetter);
    const rightShown = await page.waitFor(
      `document.body.textContent.includes('Você acertou! A alternativa correta é a ${correctLetter}.')`,
    );
    check("acertar: mensagem de acerto", rightShown);
    check(
      "responder: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );
    await prisma.attemptItem.deleteMany({
      where: {
        answeredAt: { gte: answerStarted },
        attempt: { user: { email: TEST_EMAIL } },
      },
    });
    await prisma.attempt.deleteMany({
      where: { mode: "PRACTICE", startedAt: { gte: answerStarted }, items: { none: {} } },
    });

    phase = "responder discursiva";
    const discursiveStarted = new Date();
    const discursive = await prisma.question.findFirst({
      where: { exam: { year: 2017 }, originalLabel: "D4" },
      select: { id: true },
    });
    await page.goto(`${BASE}/questoes/${discursive?.id}?nova=1`);
    const hiddenBefore = await page.evaluate<boolean>(
      "!document.body.textContent.includes('Padrão de resposta oficial')",
    );
    check("discursiva: padrão escondido antes de responder", hiddenBefore);
    const typeInto = (selector: string, value: string) =>
      page.evaluate(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
        setter.call(element, ${JSON.stringify(value)});
        element.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
    await typeInto("#answerText", "A função desenfileirar retira o primeiro caminhoneiro.");
    const counter = await page.waitFor("document.body.textContent.includes('54/5000 caracteres')");
    check("contador de caracteres acompanha a digitação", counter);
    await page.evaluate(
      "[...document.querySelectorAll('main form button')].find((b) => b.textContent.includes('Enviar resposta')).click()",
    );
    const standardShown = await page.waitFor(
      "document.body.textContent.includes('Padrão de resposta oficial') && document.body.textContent.includes('A função desenfileirar retira')",
    );
    check("enviar mostra a resposta ao lado do padrão oficial", standardShown);
    await typeInto('input[name="score_a"]', "4.5");
    await typeInto('input[name="score_b"]', "3");
    const totalLive = await page.waitFor("document.body.textContent.includes('Total: 7,5 de 10')");
    check("total da autoavaliação soma enquanto digita", totalLive);
    await page.evaluate(
      "[...document.querySelectorAll('main form button')].find((b) => b.textContent.includes('Salvar autoavaliação')).click()",
    );
    const saved = await page.waitFor(
      "document.body.textContent.includes('Autoavaliação salva: 7,5 de 10')",
    );
    check("salvar autoavaliação confirma a nota", saved);
    check(
      "discursiva: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );
    await prisma.attemptItem.deleteMany({
      where: {
        answeredAt: { gte: discursiveStarted },
        attempt: { user: { email: TEST_EMAIL } },
      },
    });
    await prisma.attempt.deleteMany({
      where: { mode: "PRACTICE", startedAt: { gte: discursiveStarted }, items: { none: {} } },
    });

    phase = "política de revelar";
    const clickButton = (label: string) =>
      page.evaluate(
        `[...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`,
      );
    const choosePolicy = async (policy: string) => {
      await page.goto(`${BASE}/questoes`);
      await page.evaluate(`(() => {
        const select = document.querySelector('select[name=policy]');
        select.value = ${JSON.stringify(policy)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await clickButton("Salvar");
      return page.waitFor("document.body.textContent.includes('Modo de correção salvo.')");
    };
    check("escolher “quando eu pedir” na lista de questões", await choosePolicy("MANUAL"));
    await page.goto(`${BASE}/questoes/${objective?.id}`);
    await choose(wrongLetter);
    const manualPending = await page.waitFor(
      `document.body.textContent.includes('Resposta registrada: alternativa ${wrongLetter}.')`,
    );
    const manualHidden = await page.evaluate<boolean>(
      "!document.documentElement.outerHTML.includes('correctLetter') && !document.body.textContent.includes('alternativa correta')",
    );
    check("quando eu pedir: responde sem ver a correção", manualPending && manualHidden);
    await clickButton("Ver correção");
    const manualRevealed = await page.waitFor(
      `document.body.textContent.includes('Você errou. Você marcou a ${wrongLetter}; a alternativa correta é a ${correctLetter}.')`,
    );
    check("“Ver correção” mostra o resultado na hora", manualRevealed);
    check("escolher “ao finalizar a sessão”", await choosePolicy("AT_END"));
    await page.goto(`${BASE}/questoes/${objective?.id}`);
    await choose(correctLetter);
    const atEndPending = await page.waitFor(
      "document.body.textContent.includes('A correção aparece quando você finalizar a sessão')",
    );
    const noRevealButton = await page.evaluate<boolean>(
      "![...document.querySelectorAll('main button')].some((b) => b.textContent.includes('Ver correção'))",
    );
    check("ao finalizar: sem correção nem botão de revelar", atEndPending && noRevealButton);
    await page.goto(`${BASE}/questoes`);
    const pendingCount = await page.waitFor(
      "document.body.textContent.includes('1 resposta nesta sessão, 1 aguardando correção')",
    );
    await clickButton("Finalizar sessão e ver resultado");
    const sessionResult = await page.waitFor(
      "location.pathname.startsWith('/questoes/sessao/') && document.body.textContent.includes('1 de 1 objetiva certa')",
      15_000,
    );
    check("finalizar a sessão leva ao resultado com os acertos", pendingCount && sessionResult);
    check(
      "política de revelar: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "simulado";
    const exam2017 = await prisma.exam.findFirstOrThrow({
      where: { year: 2017 },
      select: { id: true },
    });
    await page.goto(`${BASE}/simulados`);
    await page.evaluate(
      `document.querySelector('input[name=examId][value="${exam2017.id}"]').form.querySelector('button').click()`,
    );
    const simStarted = await page.waitFor(
      "/^\\/simulados\\/[^/]+$/.test(location.pathname) && document.body.textContent.includes('0 de 40 respondidas')",
      15_000,
    );
    check("começar o simulado da prova de 2017", simStarted);
    await page.goto(`${await page.evaluate<string>("location.href.split('?')[0]")}?q=3`);
    await page.evaluate(`(() => {
      document.querySelector('input[name=letter][value="B"]').closest('label').click();
      [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Salvar e ir para a próxima')).click();
    })()`);
    const movedOn = await page.waitFor(
      "location.search === '?q=4' && document.body.textContent.includes('1 de 40 respondidas') && [...document.querySelectorAll('nav[aria-label=\"Questões do simulado\"] a')][2].getAttribute('aria-label').includes('respondida')",
      15_000,
    );
    const simLeak = await page.evaluate<boolean>(
      "document.documentElement.outerHTML.includes('isCorrect') || document.body.textContent.includes('alternativa correta')",
    );
    check(
      "salvar marca a questão na grade e vai para a próxima, sem correção",
      movedOn && !simLeak,
    );
    await page.goto(`${await page.evaluate<string>("location.href.split('?')[0]")}/entregar`);
    const blankShown = await page.waitFor(
      "document.body.textContent.includes('39 questões em branco')",
    );
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Entregar e ver a nota')).click()",
    );
    const simDone = await page.waitFor(
      "location.pathname.endsWith('/resultado') && document.body.textContent.includes('Simulado entregue')",
      15_000,
    );
    check("entregar mostra as em branco e leva à nota", blankShown && simDone);
    const topicsShown = await page.evaluate<boolean>(
      "document.body.textContent.includes('Onde estudar mais') && document.body.textContent.includes('Revisar')",
    );
    await page.evaluate(
      "[...document.querySelectorAll('a')].find((a) => a.getAttribute('href')?.includes('/revisao?q=3')).click()",
    );
    const reviewOpened = await page.waitFor(
      "location.search === '?q=3' && document.body.textContent.includes('alternativa correta é a')",
      15_000,
    );
    check(
      "resultado mostra temas para revisar e abre a revisão da questão",
      topicsShown && reviewOpened,
    );
    check(
      "simulado: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "simulado personalizado";
    await page.goto(`${BASE}/simulados`);
    const chipText = (label: string) =>
      page.evaluate<string>(
        `([...document.querySelectorAll('label')].find((l) => l.textContent.startsWith(${JSON.stringify(label)}))?.textContent ?? '')`,
      );
    const redesAll = await chipText("Redes de Computadores");
    await page.evaluate(
      `[...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('2017')).click()`,
    );
    const valid2017 = await prisma.question.count({
      where: { status: "VALID", exam: { year: 2017 } },
    });
    const countsReact = await page.waitFor(
      `document.body.textContent.includes('${valid2017} questões disponíveis')`,
    );
    const redes2017 = await chipText("Redes de Computadores");
    check(
      "contagens por tema aparecem e mudam ao marcar um ano",
      redesAll.includes("(6)") && countsReact && redes2017 !== redesAll,
      `${redesAll} → ${redes2017}`,
    );
    await page.evaluate(
      `[...document.querySelectorAll('label')].find((l) => l.textContent.startsWith('2017')).click()`,
    );
    await page.evaluate(`(() => {
      const form = document.querySelector('select[name=quantidade]').form;
      const choose = (name, value) => {
        const select = form.querySelector('select[name=' + name + ']');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      choose('tipo', 'OBJECTIVE');
      choose('quantidade', '5');
      choose('tempo', '30');
    })()`);
    await page.waitFor("document.querySelector('select[name=quantidade]').value === '5'");
    await page.evaluate(
      "[...document.querySelector('select[name=quantidade]').form.querySelectorAll('button')].find((b) => b.textContent.includes('Montar simulado')).click()",
    );
    const customStarted = await page.waitFor(
      "/^\\/simulados\\/[^/]+$/.test(location.pathname) && document.body.textContent.includes('0 de 5 respondidas') && document.body.textContent.includes('Tempo total: 30 min') && document.body.textContent.includes('Simulado personalizado')",
      15_000,
    );
    check("montar simulado personalizado (5 objetivas, 30 min)", customStarted);
    const timerBefore = await page.evaluate<string>(
      "document.querySelector('[role=timer]')?.textContent ?? ''",
    );
    const ticking = await page.waitFor(
      `(document.querySelector('[role=timer]')?.textContent ?? '') !== ${JSON.stringify(timerBefore)}`,
      4_000,
    );
    check(
      "cronômetro conta para trás na tela",
      /^(30:00|29:\d\d)$/.test(timerBefore) && ticking,
      timerBefore,
    );
    const customId = await page.evaluate<string>("location.pathname.split('/').pop()");
    await prisma.attempt.update({
      where: { id: customId },
      data: { startedAt: new Date(Date.now() - (30 * 60 - 4) * 1000) },
    });
    await page.goto(`${BASE}/simulados/${customId}`);
    const expiredOnScreen = await page.waitFor(
      "location.pathname.endsWith('/resultado') && document.body.textContent.includes('Tempo esgotado')",
      20_000,
    );
    check("quando o tempo acaba na tela, o simulado é entregue sozinho", expiredOnScreen);
    check(
      "simulado personalizado: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "histórico";
    await page.goto(`${BASE}/historico`);
    const historyShown = await page.waitFor(
      "document.body.textContent.includes('Evolução da nota') && document.querySelectorAll('ol[aria-label^=\"Notas dos últimos\"] li').length > 0 && document.body.textContent.includes('Tentativas encerradas')",
      10_000,
    );
    check("histórico mostra a evolução e as tentativas", historyShown);
    check(
      "histórico: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

    phase = "editor do admin";
    const loginAs = async (email: string, password: string, path = "/login") => {
      await page.evaluate(
        "[...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Sair'))?.click()",
      );
      await page.waitFor("!document.querySelector('header')?.textContent.includes('Sair')", 10_000);
      await page.goto(`${BASE}${path}`);
      await page.evaluate(`(() => {
        document.querySelector('#email').value = ${JSON.stringify(email)};
        document.querySelector('#password').value = ${JSON.stringify(password)};
        document.querySelector('#password').form.requestSubmit();
      })()`);
      return page.waitFor("document.querySelector('header')?.textContent.includes('Sair')", 15_000);
    };
    const exam2017ForAdmin = await prisma.exam.findFirstOrThrow({ where: { year: 2017 } });
    const soTopic = await prisma.topic.findUniqueOrThrow({
      where: { name: "Sistemas Operacionais" },
    });
    const adminDraft = await prisma.question.create({
      data: {
        examId: exam2017ForAdmin.id,
        originalLabel: DRAFT_LABEL,
        order: 995,
        type: "OBJECTIVE",
        area: "COMPONENTE_ESPECIFICO",
        statementMd: "Rascunho para o teste do navegador",
        options: {
          create: ["A", "B", "C", "D", "E"].map((letter) => ({
            letter,
            textMd: `alternativa ${letter}`,
            isCorrect: letter === "A",
          })),
        },
        tags: { create: { topicId: soTopic.id } },
      },
      select: { id: true },
    });
    const adminIn = await loginAs(
      process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local",
      process.env.ADMIN_SEED_PASSWORD ?? "admin123",
      "/admin/entrar",
    );
    await page.goto(`${BASE}/admin/questoes/${adminDraft.id}`);
    await page.waitFor(
      "(() => { const area = document.querySelector('#statementMd'); return Boolean(area) && Object.keys(area).some((key) => key.startsWith('__reactProps')); })()",
      15_000,
    );
    await page.evaluate(`(() => {
      const area = document.querySelector('#statementMd');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, ${JSON.stringify("Texto novo digitado no navegador\n\n(ver imagem anexa: figura de teste)")});
      area.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const dirtyShown = await page.waitFor(
      "document.body.textContent.includes('Alterações não salvas') && document.body.textContent.includes('Marcadores de imagem no texto: 1 · imagens anexadas: 0')",
    );
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Salvar alterações')).click()",
    );
    const savedShown = await page.waitFor(
      "location.search === '?salvo=1' && document.body.textContent.includes('Alterações salvas')",
      15_000,
    );
    const savedText = (
      await prisma.question.findUniqueOrThrow({
        where: { id: adminDraft.id },
        select: { statementMd: true },
      })
    ).statementMd;
    check(
      "admin edita no navegador: aviso de não salvo, contador de imagens e salvamento",
      adminIn &&
        dirtyShown &&
        savedShown &&
        savedText.startsWith("Texto novo digitado no navegador"),
      `login ${adminIn}, não salvo ${dirtyShown}, salvo ${savedShown}, banco "${savedText.slice(0, 40)}"`,
    );
    await page.evaluate(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 60;
      const context = canvas.getContext('2d');
      context.fillStyle = '#1d4ed8';
      context.fillRect(0, 0, 120, 60);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Adicionar imagem'));
      const input = form.querySelector('input[type=file]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'figura.png', { type: 'image/png' }));
      input.files = transfer.files;
      form.submit();
    })()`);
    await page.waitFor("location.search === '?imagem=ok'", 15_000);
    await page.evaluate("document.querySelector('aside img')?.scrollIntoView()");
    const imageUploaded = await page.waitFor(
      "document.body.textContent.includes('Imagem enviada') && document.body.textContent.includes('Marcadores de imagem no texto: 1 · imagens anexadas: 1') && [...document.querySelectorAll('aside img')].some((img) => img.complete && img.naturalWidth === 120)",
      15_000,
    );
    const imageDetail = await page.evaluate<string>(
      "JSON.stringify({ search: location.search, sent: document.body.textContent.includes('Imagem enviada'), counter: (document.body.textContent.match(/Marcadores de imagem no texto: \\d+ · imagens anexadas: \\d+/) || [''])[0], imgs: [...document.querySelectorAll('aside img')].map((img) => img.complete + ':' + img.naturalWidth) })",
    );
    check(
      "admin envia imagem pelo painel e ela aparece na pré-visualização",
      imageUploaded,
      imageDetail,
    );
    await page.evaluate(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const context = canvas.getContext('2d');
      context.fillStyle = '#7c2d12';
      context.fillRect(0, 0, 200, 100);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Adicionar imagem'));
      const input = form.querySelector('input[type=file]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'grande.png', { type: 'image/png' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    const cropperShown = await page.waitFor(
      "Boolean(document.querySelector('[data-handle=se]')) && [...document.querySelectorAll('img[alt=\"Imagem a recortar\"]')].some((img) => img.complete && img.naturalWidth === 200)",
      10_000,
    );
    const corner = await page.evaluate<{ x: number; y: number; w: number; h: number }>(`(() => {
      const handle = document.querySelector('[data-handle=se]');
      handle.scrollIntoView({ block: 'center' });
      const box = handle.getBoundingClientRect();
      const image = document.querySelector('img[alt="Imagem a recortar"]').getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, w: image.width, h: image.height };
    })()`);
    await page.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: corner.x,
      y: corner.y,
      button: "left",
      clickCount: 1,
    });
    for (let step = 1; step <= 5; step += 1) {
      await page.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: corner.x - (corner.w / 2) * (step / 5),
        y: corner.y - (corner.h / 2) * (step / 5),
        button: "left",
      });
    }
    await page.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: corner.x - corner.w / 2,
      y: corner.y - corner.h / 2,
      button: "left",
      clickCount: 1,
    });
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Enviar recorte')).click()",
    );
    await page.waitFor("location.search === '?imagem=ok'", 15_000);
    const croppedAsset = await prisma.asset.findFirst({
      where: { question: { originalLabel: DRAFT_LABEL } },
      orderBy: { position: "desc" },
      select: { filePath: true },
    });
    const uploadRoot = process.env.UPLOAD_DIR ?? join(process.cwd(), "storage", "uploads");
    const header = croppedAsset
      ? readFileSync(join(uploadRoot, croppedAsset.filePath.replace("uploads/", ""))).subarray(
          0,
          24,
        )
      : Buffer.alloc(24);
    const croppedWidth = header.readUInt32BE(16);
    const croppedHeight = header.readUInt32BE(20);
    check(
      "recortar no painel: arrastar o canto e enviar grava só o pedaço escolhido",
      cropperShown &&
        croppedWidth >= 90 &&
        croppedWidth <= 140 &&
        Math.abs(croppedWidth / croppedHeight - 2) < 0.1,
      `${croppedWidth}×${croppedHeight}`,
    );
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Publicar para os alunos')).click()",
    );
    const publishedOnScreen = await page.waitFor(
      "document.body.textContent.includes('Publicada: os alunos veem esta questão')",
      15_000,
    );
    check("admin publica a questão pelo botão", publishedOnScreen);
    await page.goto(`${BASE}/admin/provas/nova`);
    await page.waitFor(
      "(() => { const area = document.querySelector('#texto-prova'); return Boolean(area) && Object.keys(area).some((key) => key.startsWith('__reactProps')); })()",
      15_000,
    );
    await page.evaluate(`(() => {
      const fill = (selector, value) => {
        const element = document.querySelector(selector);
        const proto = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      };
      fill('input[name=ano]', '2098');
      fill('input[name=curso]', ${JSON.stringify(TEST_COURSE)});
      fill('#texto-prova', ${JSON.stringify(["QUESTÃO 1", "Pergunta de teste", "A um", "B dois", "C três", "D quatro", "E cinco", "QUESTÃO DISCURSIVA 1", "Explique. (valor: 10,0 pontos)"].join("\n"))});
      fill('#texto-gabarito', 'QUESTÃO 1 C');
    })()`);
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Analisar')).click()",
    );
    const previewShown = await page.waitFor(
      "document.body.textContent.includes('2 questões encontradas') && document.body.textContent.includes('correta C') && ![...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Criar prova')).disabled",
      15_000,
    );
    await page.evaluate(
      "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Criar prova')).click()",
    );
    const examCreated = await page.waitFor(
      "location.search === '?importada=1' && document.body.textContent.includes('Prova criada com 2 questões em rascunho')",
      15_000,
    );
    await page.evaluate(`(() => {
      const form = [...document.querySelectorAll('form')].find((f) => f.textContent.includes('Excluir prova'));
      form.querySelector('input[name=confirmacao]').click();
      [...form.querySelectorAll('button')].find((b) => b.textContent.includes('Excluir prova')).click();
    })()`);
    const examDeleted = await page.waitFor(
      "location.pathname === '/admin' && document.body.textContent.includes('Prova excluída')",
      15_000,
    );
    check(
      "admin cadastra prova pelo painel (analisar → criar) e exclui",
      previewShown && examCreated && examDeleted,
      `prévia ${previewShown}, criada ${examCreated}, excluída ${examDeleted}`,
    );
    check(
      "editor do admin: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );
    await loginAs(TEST_EMAIL, TEST_PASSWORD);

    phase = "XSS simulado";
    await page.goto(`${BASE}/questoes`);
    const xss = await page.evaluate<{
      handler: boolean;
      inline: boolean;
      javascriptUrl: boolean;
    }>(`(async () => {
      document.body.insertAdjacentHTML('beforeend', '<img src="/nao-existe.png" onerror="window.__xssHandler = 1">');
      const inline = document.createElement('div');
      inline.innerHTML = '<a id="xsslink" href="javascript:window.__xssUrl = 1">x</a>';
      document.body.appendChild(inline);
      document.querySelector('#xsslink').click();
      document.body.insertAdjacentHTML('beforeend', '<iframe srcdoc="<script>parent.__xssFrame = 1<\\/script>"></iframe>');
      await new Promise((resolve) => setTimeout(resolve, 800));
      return { handler: window.__xssHandler === 1, inline: window.__xssFrame === 1, javascriptUrl: window.__xssUrl === 1 };
    })()`);
    check("atributo onerror injetado não executa", !xss.handler);
    check("link javascript: injetado não executa", !xss.javascriptUrl);
    check("iframe com script injetado não executa", !xss.inline);
    check(
      "o navegador registrou as violações do XSS simulado",
      cspViolations(phase).length >= 2,
      `${cspViolations(phase).length} violações`,
    );

    phase = "controle sem CSP";
    await page.goto(`http://127.0.0.1:${EVIL_PORT}/inofensivo`);
    const control = await page.evaluate<boolean>(`(async () => {
      document.body.insertAdjacentHTML('beforeend', '<img src="/nao-existe.png" onerror="window.__xssHandler = 1">');
      await new Promise((resolve) => setTimeout(resolve, 800));
      return window.__xssHandler === 1;
    })()`);
    check("controle: a mesma injeção executa numa página sem o nosso CSP", control);
    await page.goto(`http://127.0.0.1:${EVIL_PORT}/controle`, 2000);
    const controlFramed = await page.evaluate<boolean>(`(() => {
      try { return document.querySelector('#alvo').contentWindow.document.body.textContent.includes('conteúdo'); } catch { return false; }
    })()`);
    check("controle: uma página sem proteção pode ser posta num iframe", controlFramed);

    phase = "clickjacking";
    await page.goto(`http://127.0.0.1:${EVIL_PORT}/`, 2500);
    const framed = await page.evaluate<boolean>(`(() => {
      try { return document.querySelector('#alvo').contentWindow.document.body.textContent.length > 0; } catch { return false; }
    })()`);
    const refused = logs.filter(
      (entry) =>
        entry.phase === phase &&
        /X-Frame-Options|frame-ancestors|Refused to (display|frame)/i.test(entry.text),
    );
    check(
      "site do atacante não consegue mostrar o login num iframe",
      !framed && refused.length > 0,
      refused[0]?.text.slice(0, 120),
    );
  } finally {
    await removeTestUser();
    evil.close();
    chrome.kill("SIGKILL");
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} verificações no navegador passaram.`,
  );
  if (failed.length > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
