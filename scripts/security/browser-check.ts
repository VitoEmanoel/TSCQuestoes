import "dotenv/config";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import WebSocket from "ws";

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

function findChrome(): string {
  const candidates = [
    process.env.CHROME_PATH,
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      return execFileSync("which", [candidate], { encoding: "utf-8" }).trim() || candidate;
    } catch {
      continue;
    }
  }
  throw new Error("Chrome/Chromium não encontrado. Defina CHROME_PATH.");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Page {
  private nextId = 1;
  private pending = new Map<number, (value: { result?: unknown; error?: unknown }) => void>();
  private listeners: ((method: string, params: Record<string, unknown>) => void)[] = [];

  constructor(private socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.id && this.pending.has(message.id)) {
        this.pending.get(message.id)!(message);
        this.pending.delete(message.id);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message.method, message.params);
      }
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, (message) =>
        message.error
          ? reject(new Error(JSON.stringify(message.error)))
          : resolve(message.result as Record<string, unknown>),
      );
    });
  }

  on(listener: (method: string, params: Record<string, unknown>) => void) {
    this.listeners.push(listener);
  }

  async evaluate<T>(expression: string): Promise<T> {
    const reply = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result: { value: T } };
    return reply.result.value;
  }

  async goto(url: string, settleMs = 1500) {
    await this.send("Page.navigate", { url });
    await this.waitFor("document.readyState === 'complete'");
    await sleep(settleMs);
  }

  async waitFor(expression: string, timeoutMs = 10_000): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  }
}

async function openPage(): Promise<Page> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const target = await (
        await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })
      ).json();
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
      });
      return new Page(socket);
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Não consegui abrir o Chrome em modo de depuração.");
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

async function removeTestUser() {
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
    const page = await openPage();
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
      document.querySelector('main form').requestSubmit();
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
    await page.evaluate(`(() => {
      document.querySelector('#ano').value = '2017';
      document.querySelector('#tipo').value = 'DISCURSIVE';
      document.querySelector('#ano').form.requestSubmit();
    })()`);
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
    check(
      "simulado: nenhuma violação de CSP nem erro de JavaScript",
      cspViolations(phase).length === 0 && jsErrors(phase).length === 0,
      [...cspViolations(phase), ...jsErrors(phase)]
        .map((e) => e.text)
        .join(" | ")
        .slice(0, 200),
    );

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
