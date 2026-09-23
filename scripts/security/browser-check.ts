import "dotenv/config";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import WebSocket from "ws";

const BASE = process.env.ATTACK_BASE_URL ?? "http://localhost:3123";
const DEBUG_PORT = 9333;
const EVIL_PORT = 8765;
const prisma = new PrismaClient();

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

async function main() {
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
      document.querySelector('#email').value = 'admin@tscquestoes.local';
      document.querySelector('#password').value = ${JSON.stringify(process.env.ADMIN_SEED_PASSWORD ?? "admin123")};
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
      document.querySelector('main form').requestSubmit();
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
    const opened = await page.evaluate<boolean>(
      "(() => { const d = document.querySelector('details'); d.querySelector('summary').click(); return d.open; })()",
    );
    check("abrir a resposta oficial funciona", opened);
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
