import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { encode } from "@auth/core/jwt";
import { PrismaClient } from "@prisma/client";
import { slotsFor } from "../../lib/scoring";

const BASE = process.env.ATTACK_BASE_URL ?? "http://localhost:3123";
const MAILPIT = process.env.ATTACK_MAILPIT_URL ?? "http://localhost:8025/api/v1";
const SESSION_COOKIE = "authjs.session-token";
const TEST_DOMAIN = "@ataque.local";
const DRAFT_LABEL = "RASCUNHO-ATAQUE";
const TEST_COURSE = "Curso de Teste da Suíte de Ataque";
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? join(process.cwd(), "storage", "uploads");

function uploadFiles(): string[] {
  return existsSync(UPLOAD_ROOT) ? readdirSync(UPLOAD_ROOT) : [];
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function makePng(width: number, height: number, seed = 0): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height, seed % 256);
  for (let row = 0; row < height; row += 1) {
    rows[row * (width * 3 + 1)] = 0;
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const prisma = new PrismaClient();

type Result = { group: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
let currentGroup = "";

function group(name: string) {
  currentGroup = name;
  console.log(`\n== ${name}`);
}

function check(name: string, ok: boolean, detail = "") {
  results.push({ group: currentGroup, name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function pageText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

type Reply = { status: number; location: string; body: string };

class Client {
  cookies = new Map<string, string>();

  constructor(readonly ip: string) {}

  async request(
    path: string,
    init: RequestInit = {},
    extraHeaders: Record<string, string> = {},
  ): Promise<Reply> {
    const headers = new Headers(init.headers);
    headers.set("x-forwarded-for", this.ip);
    if (this.cookies.size > 0) {
      headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
    const response = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((attribute) => /max-age=0\b/i.test(attribute.trim()));
      if (expired || value === "") {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
    return {
      status: response.status,
      location: response.headers.get("location") ?? "",
      body: await response.text(),
    };
  }

  get(path: string) {
    return this.request(path);
  }

  async hiddenFields(path: string): Promise<Record<string, string>> {
    const page = await this.get(path);
    const fields: Record<string, string> = {};
    for (const match of page.body.matchAll(
      /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
    )) {
      fields[decodeEntities(match[1])] = decodeEntities(match[2] ?? "");
    }
    return fields;
  }

  async submit(
    path: string,
    fields: Record<string, string>,
    options: {
      origin?: string;
      override?: (hidden: Record<string, string>) => Record<string, string>;
    } = {},
  ): Promise<Reply> {
    const hidden = await this.hiddenFields(path);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      ...(options.override ? options.override(hidden) : hidden),
      ...fields,
    })) {
      form.append(key, value);
    }
    return this.request(path, { method: "POST", body: form }, { origin: options.origin ?? BASE });
  }

  async submitForm(path: string, marker: string, fields: Record<string, string>): Promise<Reply> {
    const page = await this.get(path);
    const form = [...page.body.matchAll(/<form\b[\s\S]*?<\/form>/g)]
      .map((match) => match[0])
      .find((candidate) => candidate.includes(marker));
    const data = new FormData();
    for (const match of (form ?? "").matchAll(
      /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
    )) {
      data.append(decodeEntities(match[1]), decodeEntities(match[2] ?? ""));
    }
    for (const [key, value] of Object.entries(fields)) {
      data.set(key, value);
    }
    return this.request(path, { method: "POST", body: data }, { origin: BASE });
  }

  async apiLogin(
    email: string,
    password: string,
    extra: Record<string, string> = {},
    csrfOverride?: string,
  ) {
    const csrf = JSON.parse((await this.get("/api/auth/csrf")).body).csrfToken as string;
    const body = new URLSearchParams({
      email,
      password,
      csrfToken: csrfOverride ?? csrf,
      callbackUrl: "/",
      ...extra,
    });
    return this.request(
      "/api/auth/callback/credentials",
      { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } },
      { origin: BASE },
    );
  }

  async session(): Promise<{ user: { id: string; email: string; role: string } } | null> {
    const reply = await this.get("/api/auth/session");
    return JSON.parse(reply.body || "null");
  }

  async headerText(): Promise<string> {
    const page = await this.get("/");
    const header = page.body.match(/<header[\s\S]*?<\/header>/)?.[0] ?? "";
    return pageText(header);
  }
}

function loginOutcome(reply: Reply): "BLOQUEADO" | "INCORRETO" | "REDIRECIONOU" | string {
  const text = pageText(reply.body);
  if (text.includes("Muitas tentativas") || reply.location.includes("code=rate_limited"))
    return "BLOQUEADO";
  if (text.includes("E-mail ou senha incorretos") || reply.location.includes("error="))
    return "INCORRETO";
  if (reply.status === 303 || reply.status === 302) return "REDIRECIONOU";
  return `OUTRO(${reply.status})`;
}

async function pageLogin(client: Client, email: string, password: string, callbackUrl = "/") {
  return client.submit("/login", { email, password, callbackUrl });
}

async function mailboxFor(address: string): Promise<{ subject: string; text: string }[]> {
  const list = await (await fetch(`${MAILPIT}/messages?limit=200`)).json();
  const mails: { subject: string; text: string; created: string }[] = [];
  for (const message of list.messages) {
    if (message.To.some((to: { Address: string }) => to.Address.toLowerCase() === address)) {
      const full = await (await fetch(`${MAILPIT}/message/${message.ID}`)).json();
      mails.push({ subject: message.Subject, text: full.Text, created: message.Created });
    }
  }
  return mails.sort((a, b) => a.created.localeCompare(b.created));
}

function tokenFrom(text: string): string | null {
  return text.match(/\/cadastro\/confirmar\?token=([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

async function createStudent(email: string, password: string, ip: string): Promise<Client> {
  const client = new Client(ip);
  await client.submit("/cadastro", {
    name: "Aluno de Teste",
    email,
    password,
    confirmPassword: password,
  });
  const mails = await mailboxFor(email);
  const token = tokenFrom(mails.at(-1)?.text ?? "");
  if (!token) throw new Error(`sem e-mail de confirmação para ${email}`);
  await client.submit(`/cadastro/confirmar?token=${token}`, { password });
  return client;
}

async function forgeToken(payload: Record<string, unknown>, secret: string, maxAge = 3600) {
  return encode({ token: payload, secret, salt: SESSION_COOKIE, maxAge });
}

function noLeak(body: string): boolean {
  return !/\bat\s+\S+\s+\(|node_modules|\/home\/|\.ts:\d+|PrismaClient|stack/i.test(body);
}

async function cleanup() {
  await prisma.attemptItem.deleteMany({
    where: { attempt: { user: { email: { endsWith: TEST_DOMAIN } } } },
  });
  await prisma.attempt.deleteMany({ where: { user: { email: { endsWith: TEST_DOMAIN } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  const drafts = { originalLabel: { startsWith: DRAFT_LABEL } };
  const draftAssets = await prisma.asset.findMany({
    where: { question: drafts },
    select: { filePath: true },
  });
  for (const asset of draftAssets) {
    const name = asset.filePath.startsWith("uploads/") ? asset.filePath.slice(8) : null;
    if (name && /^[a-f0-9]{24}\.(png|jpg)$/.test(name) && existsSync(join(UPLOAD_ROOT, name))) {
      unlinkSync(join(UPLOAD_ROOT, name));
    }
  }
  await prisma.asset.deleteMany({ where: { question: drafts } });
  await prisma.attemptItem.deleteMany({ where: { question: drafts } });
  const testExams = { exam: { course: TEST_COURSE } };
  await prisma.attemptItem.deleteMany({ where: { question: testExams } });
  await prisma.attempt.deleteMany({
    where: {
      examId: {
        in: (
          await prisma.exam.findMany({ where: { course: TEST_COURSE }, select: { id: true } })
        ).map((exam) => exam.id),
      },
    },
  });
  await prisma.asset.deleteMany({ where: { question: testExams } });
  await prisma.option.deleteMany({ where: { question: testExams } });
  await prisma.answerStandard.deleteMany({ where: { question: testExams } });
  await prisma.questionTag.deleteMany({ where: { question: testExams } });
  await prisma.question.deleteMany({ where: testExams });
  await prisma.exam.deleteMany({ where: { course: TEST_COURSE } });
  await prisma.option.deleteMany({ where: { question: drafts } });
  await prisma.questionTag.deleteMany({ where: { question: drafts } });
  await prisma.answerStandard.deleteMany({ where: { question: drafts } });
  await prisma.question.deleteMany({ where: drafts });
  await prisma.pendingSignup.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  await prisma.loginThrottle.deleteMany({});
  await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${TEST_DOMAIN.slice(1)}`)}`, {
    method: "DELETE",
  });
}

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return true;
  } catch {
    return false;
  }
}

async function preflight(): Promise<boolean> {
  const problems: string[] = [];
  if (!(await reachable(`${BASE}/api/auth/csrf`))) {
    problems.push(
      [
        `O app não está respondendo em ${BASE}.`,
        "  Em outro terminal, suba a versão de produção e deixe rodando:",
        "    npm run security:serve",
        "  (é o mesmo que `next build && next start -p 3123`; o modo `npm run dev` não serve,",
        "  porque em desenvolvimento as páginas de erro mostram stack trace de propósito).",
      ].join("\n"),
    );
  }
  if (!(await reachable(`${MAILPIT}/messages`))) {
    problems.push(
      [
        "O Mailpit não está respondendo em http://localhost:8025.",
        "  Suba com: docker compose up -d mailpit",
      ].join("\n"),
    );
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    problems.push("O Postgres não está respondendo. Suba com: docker compose up -d postgres");
  }
  if (problems.length > 0) {
    console.error(`\nNão dá para rodar a suíte ainda:\n\n${problems.join("\n\n")}\n`);
    return false;
  }
  return true;
}

async function main() {
  const host = new URL(BASE).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("A suíte de ataque só roda contra localhost.");
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET ausente no .env");
  if (!(await preflight())) {
    await prisma.$disconnect();
    process.exit(2);
  }
  await cleanup();

  const studentEmail = `aluno${TEST_DOMAIN}`;
  const studentPassword = "senhaAluno123";
  const student = await createStudent(studentEmail, studentPassword, "10.50.0.1");
  const studentSession = await student.session();
  const studentId = studentSession?.user.id ?? "";
  const anyQuestion = await prisma.question.findFirst({ select: { id: true } });

  group("Acesso sem sessão");
  const anon = new Client("10.51.0.1");
  let reply = await anon.get("/questoes");
  check(
    "/questoes sem login redireciona para o login",
    reply.status === 307 && reply.location.startsWith("/login"),
    reply.location,
  );
  reply = await anon.get(`/questoes/${anyQuestion?.id}`);
  check(
    "detalhe de questão sem login redireciona",
    reply.status === 307 && reply.location.startsWith("/login"),
  );
  check("/api/auth/session sem login é nulo", (await anon.session()) === null);

  group("Cookie de sessão forjado ou adulterado");
  const legit = student.cookies.get(SESSION_COOKIE) ?? "";
  check("o aluno de teste tem cookie de sessão", legit.length > 50);
  const cases: [string, string][] = [
    ["cookie aleatório", randomBytes(180).toString("base64url")],
    [
      "cookie legítimo com 1 caractere trocado",
      legit.slice(0, 60) + (legit[60] === "A" ? "B" : "A") + legit.slice(61),
    ],
    ["cookie legítimo truncado", legit.slice(0, legit.length - 20)],
    [
      "JWT sem assinatura (alg none) dizendo ADMIN",
      `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: studentId, role: "ADMIN", email: studentEmail })).toString("base64url")}.`,
    ],
    [
      "token ADMIN cifrado com outra chave",
      await forgeToken(
        { sub: studentId, role: "ADMIN", email: studentEmail },
        randomBytes(32).toString("base64"),
      ),
    ],
    [
      "token vencido cifrado com a chave certa",
      await forgeToken({ sub: studentId, role: "STUDENT", email: studentEmail }, secret, -60),
    ],
  ];
  for (const [name, value] of cases) {
    const forged = new Client("10.52.0.1");
    forged.cookies.set(SESSION_COOKIE, value);
    const session = await forged.session();
    const protectedPage = await forged.get("/questoes");
    check(
      `${name}: sem sessão e sem acesso`,
      session === null && protectedPage.status === 307,
      `sessão=${JSON.stringify(session)?.slice(0, 40)} /questoes=${protectedPage.status}`,
    );
  }

  group("Chave secreta vazada (defesa em profundidade)");
  const leaked = new Client("10.53.0.1");
  leaked.cookies.set(
    SESSION_COOKIE,
    await forgeToken(
      { sub: studentId, role: "ADMIN", email: studentEmail, name: "Aluno de Teste" },
      secret,
    ),
  );
  const leakedSession = await leaked.session();
  const leakedHeader = await leaked.headerText();
  check(
    "token legítimo com role=ADMIN: a camada de dados relê o papel no banco e não mostra o painel",
    leakedHeader.includes("Sair") &&
      !leakedHeader.includes("Painel") &&
      !/\bAdmin\b/.test(leakedHeader),
    `/api/auth/session diz ${leakedSession?.user.role}; cabeçalho: "${leakedHeader.slice(0, 60)}"`,
  );
  const ghost = new Client("10.53.0.2");
  ghost.cookies.set(
    SESSION_COOKIE,
    await forgeToken({ sub: "usuario-que-nao-existe", role: "ADMIN" }, secret),
  );
  reply = await ghost.get("/questoes");
  check(
    "token legítimo de usuário inexistente não acessa nada",
    reply.status === 307 && (await ghost.headerText()).includes("Entrar"),
  );

  group("Fixação de sessão");
  const fixation = new Client("10.54.0.1");
  const planted = await forgeToken({ sub: "plantado" }, randomBytes(32).toString("base64"));
  fixation.cookies.set(SESSION_COOKIE, planted);
  await pageLogin(fixation, studentEmail, studentPassword);
  const after = fixation.cookies.get(SESSION_COOKIE);
  check(
    "cookie plantado antes do login é substituído",
    Boolean(after) && after !== planted && (await fixation.session())?.user.email === studentEmail,
  );

  group("CSRF e origem forjada");
  const csrfVictim = await createStudent(`csrf${TEST_DOMAIN}`, "senhaCsrf123", "10.55.0.1");
  reply = await csrfVictim.submit("/", {}, { origin: "https://site-malicioso.example" });
  check(
    "Sair disparado de outro site não desloga",
    (await csrfVictim.session()) !== null,
    `status ${reply.status}`,
  );
  await csrfVictim.submit("/", {});
  check("controle: Sair pelo próprio site desloga", (await csrfVictim.session()) === null);
  const evil = new Client("10.55.0.2");
  const pendingBefore = await prisma.pendingSignup.count();
  reply = await evil.submit(
    "/cadastro",
    {
      name: "Via CSRF",
      email: `viacsrf${TEST_DOMAIN}`,
      password: "senhaCsrf123",
      confirmPassword: "senhaCsrf123",
    },
    { origin: "https://site-malicioso.example" },
  );
  check(
    "cadastro disparado de outro site não é processado",
    (await prisma.pendingSignup.count()) === pendingBefore &&
      (await mailboxFor(`viacsrf${TEST_DOMAIN}`)).length === 0,
    `status ${reply.status}`,
  );
  check("resposta de origem recusada não vaza detalhes internos", noLeak(reply.body));
  const legitSignup = new Client("10.55.0.6");
  await legitSignup.submit("/cadastro", {
    name: "Pelo Site",
    email: `pelosite${TEST_DOMAIN}`,
    password: "senhaSite123",
    confirmPassword: "senhaSite123",
  });
  check(
    "controle: o mesmo cadastro pelo próprio site é processado",
    (await mailboxFor(`pelosite${TEST_DOMAIN}`)).length === 1,
  );
  const noCsrf = new Client("10.55.0.3");
  reply = await noCsrf.request(
    "/api/auth/callback/credentials",
    {
      method: "POST",
      body: new URLSearchParams({
        email: studentEmail,
        password: studentPassword,
        callbackUrl: "/",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    },
    { origin: BASE },
  );
  check(
    "login na API sem token CSRF não cria sessão",
    (await noCsrf.session()) === null,
    reply.location,
  );
  const other = new Client("10.55.0.4");
  const foreignCsrf = JSON.parse((await other.get("/api/auth/csrf")).body).csrfToken;
  const stolen = new Client("10.55.0.5");
  await stolen.apiLogin(studentEmail, studentPassword, {}, foreignCsrf);
  check(
    "login na API com token CSRF de outra pessoa não cria sessão",
    (await stolen.session()) === null,
  );

  group("Adulteração pelo DevTools");
  const dev = new Client("10.56.0.1");
  reply = await dev.submit(
    "/login",
    { email: studentEmail, password: studentPassword, callbackUrl: "/" },
    {
      override: (hidden) => {
        const key = Object.keys(hidden).find((name) => /^\$ACTION_\d+:0$/.test(name));
        return key
          ? { ...hidden, [key]: JSON.stringify({ id: "f".repeat(42), bound: "$@1" }) }
          : hidden;
      },
    },
  );
  check(
    "id de Server Action inventado não executa nada",
    (await dev.session()) === null,
    `status ${reply.status}`,
  );
  await pageLogin(dev, studentEmail, studentPassword);
  check(
    "controle: o mesmo login com o id de ação verdadeiro entra",
    (await dev.session())?.user.email === studentEmail,
  );
  await dev.submit("/", {});
  check("erro de ação inexistente não vaza stack trace", noLeak(reply.body));
  reply = await dev.submit(
    "/cadastro",
    { name: "Args", email: `args${TEST_DOMAIN}`, password: "curta", confirmPassword: "curta" },
    {
      override: (hidden) => {
        const key = Object.keys(hidden).find((name) => /^\$ACTION_\d+:1$/.test(name));
        return key ? { ...hidden, [key]: JSON.stringify([{ sentTo: "falso@x.com" }]) } : hidden;
      },
    },
  );
  const argsText = pageText(reply.body);
  check(
    "estado anterior forjado ($ACTION_1:1) não pula a validação",
    argsText.includes("pelo menos 8 caracteres") && !argsText.includes("Verifique seu e-mail"),
  );
  reply = await dev.submit("/login", {
    email: studentEmail,
    password: studentPassword,
    callbackUrl: "https://site-malicioso.example/roubo",
  });
  check(
    "callbackUrl oculto trocado para site externo é neutralizado",
    reply.status === 303 && !reply.location.includes("site-malicioso"),
    reply.location,
  );
  const confirmTamper = new Client("10.56.0.2");
  await confirmTamper.submit("/cadastro", {
    name: "Troca Token",
    email: `troca${TEST_DOMAIN}`,
    password: "senhaTroca123",
    confirmPassword: "senhaTroca123",
  });
  const realToken = tokenFrom((await mailboxFor(`troca${TEST_DOMAIN}`))[0]?.text ?? "") ?? "";
  reply = await confirmTamper.submit(`/cadastro/confirmar?token=${realToken}`, {
    password: "senhaTroca123",
    token: randomBytes(32).toString("base64url"),
  });
  check(
    "token oculto trocado no formulário de ativação não ativa",
    (await prisma.user.count({ where: { email: `troca${TEST_DOMAIN}` } })) === 0,
  );
  const injector = new Client("10.56.0.3");
  await injector.submit("/cadastro", {
    name: "Injetor",
    email: `injetor${TEST_DOMAIN}`,
    password: "senhaInjetor1",
    confirmPassword: "senhaInjetor1",
    role: "ADMIN",
    isAdmin: "true",
    "__proto__[role]": "ADMIN",
  });
  const injectToken = tokenFrom((await mailboxFor(`injetor${TEST_DOMAIN}`))[0]?.text ?? "") ?? "";
  await injector.submit(`/cadastro/confirmar?token=${injectToken}`, {
    password: "senhaInjetor1",
    role: "ADMIN",
  });
  check(
    "campos de papel injetados no cadastro/ativação são ignorados",
    (await injector.session())?.user.role === "STUDENT",
  );
  await injector.apiLogin(`injetor${TEST_DOMAIN}`, "senhaInjetor1", { role: "ADMIN" });
  check(
    "login forjado na API com role=ADMIN continua STUDENT",
    (await injector.session())?.user.role === "STUDENT",
  );
  check(
    "continua existindo exatamente 1 ADMIN",
    (await prisma.user.count({ where: { role: "ADMIN" } })) === 1,
  );

  group("Injeção e entradas extremas");
  const inj = new Client("10.57.0.1");
  for (const email of [
    "' OR '1'='1' --",
    `${studentEmail}' --`,
    "admin@tscquestoes.local\u0000",
    '"; DROP TABLE "User"; --@x.com',
  ]) {
    reply = await pageLogin(inj, email, "qualquer");
    check(
      `login com e-mail malicioso ${JSON.stringify(email).slice(0, 30)} não entra`,
      (await inj.session()) === null && reply.status < 500,
      `status ${reply.status}`,
    );
  }
  check("tabela User continua lá", (await prisma.user.count()) > 0);
  const huge = new Client("10.57.0.2");
  const started = Date.now();
  reply = await pageLogin(huge, studentEmail, "a".repeat(100_000));
  check(
    "senha de 100 mil caracteres não derruba o servidor nem entra",
    (await huge.session()) === null && reply.status < 500 && Date.now() - started < 5000,
    `status ${reply.status} em ${Date.now() - started} ms`,
  );
  reply = await huge.get("/questoes/%00%2F..%2F..%2Fetc%2Fpasswd");
  check(
    "caminho com byte nulo/travessia não vaza nada",
    reply.status === 307 || reply.status === 404,
  );

  group("Força bruta, credential stuffing e tempo de resposta");
  await prisma.loginThrottle.deleteMany({});
  const brute = new Client("10.58.0.1");
  const sequence: string[] = [];
  for (let i = 0; i < 6; i += 1)
    sequence.push(loginOutcome(await pageLogin(brute, studentEmail, `errada${i}`)));
  check(
    "5ª senha errada bloqueia a conta",
    sequence.slice(0, 4).every((o) => o === "INCORRETO") &&
      sequence[4] === "BLOQUEADO" &&
      sequence[5] === "BLOQUEADO",
    sequence.join(","),
  );
  check(
    "conta bloqueada não entra nem com a senha certa",
    loginOutcome(await pageLogin(new Client("10.58.0.2"), studentEmail, studentPassword)) ===
      "BLOQUEADO",
  );
  await prisma.loginThrottle.deleteMany({});
  const burst = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      new Client("10.58.0.3").apiLogin(studentEmail, `rajada${i}`),
    ),
  );
  const tested = burst.filter((r) => loginOutcome(r) === "INCORRETO").length;
  check(
    "rajada de 20 tentativas paralelas: no máximo 4 testam a senha",
    tested <= 4,
    `${tested} testaram`,
  );
  await prisma.loginThrottle.deleteMany({});
  let last = "";
  for (let i = 0; i < 50; i += 1)
    last = loginOutcome(
      await pageLogin(new Client("10.58.9.9"), `stuffing${i}${TEST_DOMAIN}`, "senha123"),
    );
  check("50 e-mails diferentes do mesmo IP bloqueiam o IP", last === "BLOQUEADO");
  await prisma.loginThrottle.deleteMany({});
  const measure = async (email: string) => {
    const times: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const t = performance.now();
      await new Client(`10.59.${i}.${email.length}`).apiLogin(email, "errada-total");
      times.push(performance.now() - t);
      await prisma.loginThrottle.deleteMany({});
    }
    times.sort((a, b) => a - b);
    return times.slice(1, -1).reduce((a, b) => a + b, 0) / 4;
  };
  const existing = await measure(studentEmail);
  const missing = await measure(`fantasma${TEST_DOMAIN}`);
  check(
    "tempo de login não revela se o e-mail existe",
    Math.abs(existing - missing) < 50,
    `${existing.toFixed(0)} x ${missing.toFixed(0)} ms`,
  );

  group("Cabeçalhos e cookies");
  const loginPage = await fetch(`${BASE}/login`, { headers: { "x-forwarded-for": "10.60.0.1" } });
  const html = await loginPage.text();
  const csp = loginPage.headers.get("content-security-policy") ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1] ?? "";
  const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  check(
    "CSP da página tem nonce e todos os scripts o carregam",
    nonce.length > 10 &&
      scriptTags.length > 0 &&
      scriptTags.every((tag) => tag.includes(`nonce="${nonce}"`)),
    `${scriptTags.length} scripts`,
  );
  const second = (await fetch(`${BASE}/login`)).headers.get("content-security-policy") ?? "";
  check("nonce muda a cada requisição", second.match(/'nonce-([^']+)'/)?.[1] !== nonce);
  for (const directive of [
    "default-src 'self'",
    "'strict-dynamic'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]) {
    check(`CSP contém ${directive}`, csp.includes(directive));
  }
  check(
    "CSP de produção não libera 'unsafe-inline' nem 'unsafe-eval' para scripts",
    !/script-src[^;]*'unsafe-(inline|eval)'/.test(csp),
  );
  for (const path of ["/login", "/api/auth/csrf", "/assets/2017/1-1.png"]) {
    const response = await fetch(`${BASE}${path}`);
    const h = response.headers;
    check(
      `${path}: X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP`,
      h.get("x-frame-options") === "DENY" &&
        h.get("x-content-type-options") === "nosniff" &&
        h.get("referrer-policy") === "same-origin" &&
        Boolean(h.get("permissions-policy")?.includes("camera=()")) &&
        h.get("cross-origin-opener-policy") === "same-origin",
    );
    check(`${path}: sem X-Powered-By`, !h.has("x-powered-by"));
  }
  const csrfResponse = await fetch(`${BASE}/api/auth/csrf`);
  const csrfCookie = csrfResponse.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("authjs.csrf-token="));
  check(
    "cookie CSRF é HttpOnly, SameSite=Lax e Path=/",
    Boolean(
      csrfCookie &&
      /HttpOnly/i.test(csrfCookie) &&
      /SameSite=Lax/i.test(csrfCookie) &&
      /Path=\//i.test(csrfCookie),
    ),
    csrfCookie?.split(";").slice(1).join(";"),
  );
  const csrfToken = JSON.parse(await csrfResponse.text()).csrfToken;
  const loginResponse = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookie?.split(";")[0] ?? "",
      origin: BASE,
      "x-forwarded-for": "10.60.0.2",
    },
    body: new URLSearchParams({
      email: studentEmail,
      password: studentPassword,
      csrfToken,
      callbackUrl: "/",
    }),
  });
  const sessionCookie = loginResponse.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  check(
    "cookie de sessão é HttpOnly, SameSite=Lax e Path=/",
    Boolean(
      sessionCookie &&
      /HttpOnly/i.test(sessionCookie) &&
      /SameSite=Lax/i.test(sessionCookie) &&
      /Path=\//i.test(sessionCookie),
    ),
    sessionCookie?.split(";").slice(1).join(";"),
  );

  group("Respostas das questões");
  const objective = await prisma.question.findFirst({
    where: { exam: { year: 2017 }, originalLabel: "1" },
    select: { id: true, options: { select: { letter: true, isCorrect: true } } },
  });
  const discursive = await prisma.question.findFirst({
    where: { exam: { year: 2017 }, originalLabel: "D1" },
    select: { id: true },
  });
  const rightLetter = objective?.options.find((option) => option.isCorrect)?.letter ?? "";
  const wrongLetter = rightLetter === "A" ? "B" : "A";
  const answerPath = `/questoes/${objective?.id}`;
  const answerer = new Client("10.61.0.1");
  await pageLogin(answerer, studentEmail, studentPassword);
  const before = await answerer.get(answerPath);
  check(
    "gabarito não vai para a página antes de responder",
    !before.body.includes("isCorrect") && !pageText(before.body).includes("alternativa correta"),
  );
  const itemsOf = () =>
    prisma.attemptItem.findMany({
      where: { attempt: { user: { email: studentEmail } } },
      orderBy: { answeredAt: "asc" },
      select: { selectedLetter: true, isCorrect: true },
    });
  reply = await answerer.submitForm(answerPath, 'name="letter"', {
    letter: wrongLetter,
    isCorrect: "true",
    correctLetter: wrongLetter,
  });
  check(
    "campos isCorrect/correctLetter forjados não mudam a correção",
    pageText(reply.body).includes(
      `Você errou. Você marcou a ${wrongLetter}; a alternativa correta é a ${rightLetter}.`,
    ) &&
      JSON.stringify(await itemsOf()) ===
        JSON.stringify([{ selectedLetter: wrongLetter, isCorrect: false }]),
  );
  const countBefore = (await itemsOf()).length;
  for (const letter of ["Z", "a", "AB", "' OR 1=1 --", ""]) {
    await answerer.submitForm(answerPath, 'name="letter"', { letter });
  }
  await answerer.submitForm(answerPath, 'name="letter"', {
    letter: "A",
    questionId: discursive?.id ?? "",
  });
  await answerer.submitForm(answerPath, 'name="letter"', { letter: "A", questionId: "nao-existe" });
  check(
    "letras inválidas e questionId trocado não gravam nada",
    (await itemsOf()).length === countBefore,
  );
  const loggedOutAnswer = new Client("10.61.0.2");
  const answerForm = (await answerer.get(answerPath)).body;
  const formHtml = [...answerForm.matchAll(/<form\b[\s\S]*?<\/form>/g)]
    .map((match) => match[0])
    .find((candidate) => candidate.includes('name="letter"'));
  const anonymousData = new FormData();
  for (const match of (formHtml ?? "").matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
  )) {
    anonymousData.append(decodeEntities(match[1]), decodeEntities(match[2] ?? ""));
  }
  anonymousData.set("letter", rightLetter);
  await loggedOutAnswer.request(
    answerPath,
    { method: "POST", body: anonymousData },
    { origin: BASE },
  );
  check(
    "ação de responder reaproveitada sem login não grava nada",
    (await itemsOf()).length === countBefore,
  );
  group("Respostas discursivas");
  const discursiveQuestion = await prisma.question.findFirst({
    where: { exam: { year: 2017 }, originalLabel: "D4" },
    select: { id: true },
  });
  const discursivePath = `/questoes/${discursiveQuestion?.id}`;
  const beforeAnswer = await answerer.get(discursivePath);
  check(
    "padrão de resposta não vai para a página antes de responder",
    !beforeAnswer.body.includes("desenfileirar() : texto") &&
      !pageText(beforeAnswer.body).includes("Padrão de resposta oficial"),
  );
  await answerer.submitForm(discursivePath, 'name="answerText"', {
    answerText: '<img src=x onerror="alert(1)"> resposta',
  });
  const revealed = await answerer.get(discursivePath);
  check(
    "HTML na resposta aparece escapado, sem virar elemento",
    !revealed.body.includes('<img src=x onerror="alert(1)">') &&
      revealed.body.includes("&lt;img src=x"),
  );
  const ownItem = await prisma.attemptItem.findFirst({
    where: { attempt: { user: { email: studentEmail } }, answerText: { not: null } },
    select: { id: true },
  });
  const invalidScores: Record<string, string>[] = [
    { score_a: "7", score_b: "1" },
    { score_a: "-1", score_b: "1" },
    { score_a: "3", score_b: "1", score_z: "9" },
  ];
  for (const scores of invalidScores) {
    await answerer.submitForm(discursivePath, 'name="itemId"', scores);
  }
  check(
    "notas acima do máximo, negativas ou de item inexistente não são gravadas",
    (
      await prisma.attemptItem.findUnique({
        where: { id: ownItem?.id },
        select: { selfScore: true },
      })
    )?.selfScore === null,
  );
  await answerer.submitForm(discursivePath, 'name="itemId"', { score_a: "5", score_b: "4" });
  const intruder = await createStudent(`intruso${TEST_DOMAIN}`, "senhaIntruso1", "10.62.0.1");
  await intruder.submitForm(discursivePath, 'name="answerText"', { answerText: "minha" });
  await intruder.submitForm(discursivePath, 'name="itemId"', {
    itemId: ownItem?.id ?? "",
    score_a: "0",
    score_b: "0",
  });
  check(
    "outro aluno não altera a autoavaliação alheia trocando o itemId (IDOR)",
    (
      await prisma.attemptItem.findUnique({
        where: { id: ownItem?.id },
        select: { selfScore: true },
      })
    )?.selfScore === 9,
  );
  check(
    "outro aluno não vê a resposta alheia",
    !(await intruder.get(discursivePath)).body.includes("onerror"),
  );

  group("Política de revelar resposta");
  const formFields = async (client: Client, path: string, marker: string) => {
    const page = await client.get(path);
    const form = [...page.body.matchAll(/<form\b[\s\S]*?<\/form>/g)]
      .map((match) => match[0])
      .find((candidate) => candidate.includes(marker));
    const fields: Record<string, string> = {};
    for (const match of (form ?? "").matchAll(
      /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g,
    )) {
      fields[decodeEntities(match[1])] = decodeEntities(match[2] ?? "");
    }
    return fields;
  };
  const postFields = (client: Client, path: string, fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      data.append(key, value);
    }
    return client.request(path, { method: "POST", body: data }, { origin: BASE });
  };
  const policyOf = async () =>
    (
      await prisma.attempt.findFirst({
        where: { user: { email: studentEmail }, mode: "PRACTICE", status: "IN_PROGRESS" },
        select: { revealPolicy: true },
      })
    )?.revealPolicy;
  const latestItem = (questionId: string | undefined) =>
    prisma.attemptItem.findFirst({
      where: { attempt: { user: { email: studentEmail } }, questionId },
      orderBy: { answeredAt: "desc" },
      select: { id: true, revealedAt: true, attemptId: true },
    });
  const leaksVerdict = (body: string) => {
    const text = pageText(body);
    return (
      /correctLetter|isCorrect/.test(body) ||
      text.includes("alternativa correta") ||
      text.includes("Você acertou") ||
      text.includes("(acertou)") ||
      text.includes("(errou)")
    );
  };
  const leaksStandard = (body: string) =>
    body.includes("desenfileirar() : texto") ||
    pageText(body).includes("Padrão de resposta oficial");

  const selfEvalFields = await formFields(answerer, discursivePath, 'name="score_a"');
  await answerer.submitForm("/questoes", 'name="policy"', { policy: "HACK" });
  check("modo de correção inválido é recusado", (await policyOf()) === "IMMEDIATE");
  await answerer.submitForm("/questoes", 'name="policy"', { policy: "MANUAL" });
  check("aluno troca o modo para “quando eu pedir”", (await policyOf()) === "MANUAL");

  reply = await answerer.submitForm(answerPath, 'name="letter"', { letter: wrongLetter });
  const manualItem = await latestItem(objective?.id);
  check(
    "no modo manual, a resposta da ação não traz a correção",
    !leaksVerdict(reply.body) && manualItem?.revealedAt === null,
  );
  const reloaded = await answerer.get(answerPath);
  check(
    "no modo manual, a página recarregada mostra “aguardando correção” sem o gabarito",
    !leaksVerdict(reloaded.body) && pageText(reloaded.body).includes("aguardando correção"),
  );
  const revealObjectiveFields = await formFields(answerer, answerPath, 'name="itemId"');
  reply = await postFields(intruder, answerPath, revealObjectiveFields);
  check(
    "outro aluno não revela a correção alheia com o itemId (IDOR)",
    !leaksVerdict(reply.body) && (await latestItem(objective?.id))?.revealedAt === null,
  );
  await answerer.submitForm(`${discursivePath}?nova=1`, 'name="answerText"', {
    answerText: "manual",
  });
  const manualDiscursive = await latestItem(discursiveQuestion?.id);
  const pendingDiscursivePage = await answerer.get(discursivePath);
  check(
    "no modo manual, o padrão da discursiva não vai para a página antes de pedir",
    !leaksStandard(pendingDiscursivePage.body) && manualDiscursive?.revealedAt === null,
  );
  await postFields(answerer, discursivePath, {
    ...selfEvalFields,
    itemId: manualDiscursive?.id ?? "",
    score_a: "5",
    score_b: "4",
  });
  check(
    "autoavaliação antes de revelar o padrão não é gravada",
    (
      await prisma.attemptItem.findUnique({
        where: { id: manualDiscursive?.id },
        select: { selfScore: true },
      })
    )?.selfScore === null,
  );
  const revealDiscursiveFields = await formFields(answerer, discursivePath, 'name="itemId"');
  await answerer.submitForm("/questoes", 'name="policy"', { policy: "IMMEDIATE" });
  check("com respostas pendentes o modo não pode ser trocado", (await policyOf()) === "MANUAL");
  reply = await answerer.submitForm(answerPath, 'name="itemId"', {});
  check(
    "o próprio aluno revela a objetiva quando pede",
    pageText(reply.body).includes(
      `Você errou. Você marcou a ${wrongLetter}; a alternativa correta é a ${rightLetter}.`,
    ) && (await latestItem(objective?.id))?.revealedAt !== null,
  );
  await answerer.submitForm(discursivePath, 'name="itemId"', {});
  check(
    "o próprio aluno revela o padrão da discursiva quando pede",
    leaksStandard((await answerer.get(discursivePath)).body),
  );

  await answerer.submitForm("/questoes", 'name="policy"', { policy: "AT_END" });
  check("sem pendências o modo muda para “ao finalizar”", (await policyOf()) === "AT_END");
  reply = await answerer.submitForm(answerPath, 'name="letter"', { letter: rightLetter });
  const atEndItem = await latestItem(objective?.id);
  check(
    "ao finalizar: a resposta da ação e a página não trazem a correção",
    !leaksVerdict(reply.body) &&
      !leaksVerdict((await answerer.get(answerPath)).body) &&
      atEndItem?.revealedAt === null,
  );
  reply = await postFields(answerer, answerPath, {
    ...revealObjectiveFields,
    itemId: atEndItem?.id ?? "",
  });
  check(
    "ao finalizar: forjar o “Ver correção” pelo DevTools não revela antes do fim",
    !leaksVerdict(reply.body) && (await latestItem(objective?.id))?.revealedAt === null,
  );
  await answerer.submitForm(`${discursivePath}?nova=1`, 'name="answerText"', {
    answerText: "no fim",
  });
  const atEndDiscursive = await latestItem(discursiveQuestion?.id);
  await postFields(answerer, discursivePath, {
    ...revealDiscursiveFields,
    itemId: atEndDiscursive?.id ?? "",
  });
  check(
    "ao finalizar: forjar a revelação da discursiva não mostra o padrão antes do fim",
    !leaksStandard((await answerer.get(discursivePath)).body) &&
      (await latestItem(discursiveQuestion?.id))?.revealedAt === null,
  );
  await intruder.submitForm("/questoes", 'name="policy"', { policy: "AT_END" });
  await intruder.submitForm(answerPath, 'name="letter"', { letter: "A" });
  await intruder.submitForm("/questoes", "Finalizar sessão", {});
  check(
    "outro aluno finalizando a própria sessão não revela a do aluno",
    (await latestItem(objective?.id))?.revealedAt === null,
  );
  reply = await answerer.submitForm("/questoes", "Finalizar sessão", {});
  const finished = await prisma.attempt.findUnique({
    where: { id: atEndItem?.attemptId },
    select: {
      status: true,
      items: { where: { revealedAt: null }, select: { id: true } },
    },
  });
  check(
    "finalizar revela tudo e leva ao resultado da sessão",
    finished?.status === "SUBMITTED" &&
      finished.items.length === 0 &&
      reply.location.includes(`/questoes/sessao/${atEndItem?.attemptId}`),
    `status ${reply.status} → ${reply.location}`,
  );
  const resultPage = await answerer.get(`/questoes/sessao/${atEndItem?.attemptId}`);
  check(
    "resultado da sessão mostra acertos e o aluno volta a ver a correção",
    pageText(resultPage.body).includes("1 de 1 objetiva certa") &&
      pageText((await answerer.get(answerPath)).body).includes("(acertou)"),
    pageText(resultPage.body).slice(0, 400),
  );
  reply = await intruder.get(`/questoes/sessao/${atEndItem?.attemptId}`);
  check("outro aluno não abre o resultado da sessão alheia", reply.status === 404);
  check(
    "nova sessão continua com o modo escolhido",
    (await answerer.get("/questoes")).body.includes('value="AT_END" selected=""'),
  );

  group("Questões anuladas");
  const countOf = (where: Record<string, unknown>) =>
    prisma.question.count({ where: { exam: { year: 2017 }, type: "OBJECTIVE", ...where } });
  const [validCount, anuladaCount, allCount] = await Promise.all([
    countOf({ status: "VALID" }),
    countOf({ status: "ANULADA" }),
    countOf({}),
  ]);
  const listText = async (query: string) =>
    pageText((await answerer.get(`/questoes?ano=2017&tipo=OBJECTIVE${query}`)).body);
  let text = await listText("");
  check(
    "lista padrão esconde as anuladas e avisa quantas estão ocultas",
    text.includes(`${validCount} questões encontradas`) &&
      text.includes(`${anuladaCount} anulada pelo INEP oculta`) &&
      !text.includes("Anulada "),
    text.slice(text.indexOf("encontrad") - 10, text.indexOf("encontrad") + 60),
  );
  text = await listText("&status=ANULADA");
  check(
    "filtro “Anuladas” mostra só as anuladas",
    text.includes(`${anuladaCount} questão encontrada`),
  );
  text = await listText("&status=TODAS");
  check(
    "filtro “Todas” mostra válidas e anuladas",
    text.includes(`${allCount} questões encontradas`),
  );
  text = await listText("&status=%27%20OR%201%3D1%20--");
  check(
    "valor forjado no filtro de situação cai no padrão (só válidas)",
    text.includes(`${validCount} questões encontradas`),
  );
  const annulled = await prisma.question.findFirst({
    where: { exam: { year: 2017 }, status: "ANULADA", type: "OBJECTIVE" },
    select: { id: true, order: true, options: { select: { letter: true } } },
  });
  const [beforeAnnulled, afterAnnulled] = await Promise.all([
    prisma.question.findFirst({
      where: { exam: { year: 2017 }, type: "OBJECTIVE", order: { lt: annulled?.order } },
      orderBy: { order: "desc" },
      select: { id: true },
    }),
    prisma.question.findFirst({
      where: { exam: { year: 2017 }, type: "OBJECTIVE", order: { gt: annulled?.order } },
      orderBy: { order: "asc" },
      select: { id: true },
    }),
  ]);
  const neighbour = (await answerer.get(`/questoes/${beforeAnnulled?.id}`)).body;
  check(
    "“próxima” pula a anulada",
    neighbour.includes(`href="/questoes/${afterAnnulled?.id}"`) &&
      !neighbour.includes(`href="/questoes/${annulled?.id}"`),
  );
  reply = await answerer.get(`/questoes/${annulled?.id}`);
  check(
    "link direto da anulada continua abrindo, com o aviso",
    reply.status === 200 && pageText(reply.body).includes("Questão anulada pelo INEP"),
  );
  await answerer.submitForm(answerPath, 'name="letter"', { letter: rightLetter });
  await answerer.submitForm(`/questoes/${annulled?.id}`, 'name="letter"', {
    letter: annulled?.options[0]?.letter ?? "A",
  });
  reply = await answerer.submitForm("/questoes", "Finalizar sessão", {});
  const scoredId = reply.location.split("/").pop() ?? "";
  const scored = await prisma.attempt.findUnique({
    where: { id: scoredId },
    select: { autoScore: true, _count: { select: { items: true } } },
  });
  text = pageText((await answerer.get(`/questoes/sessao/${scoredId}`)).body);
  check(
    "anulada fica fora da nota: 1 certa de 1 válida = 100%",
    scored?.autoScore === 100 &&
      scored._count.items === 2 &&
      text.includes("1 de 1 objetiva certa (100%)") &&
      text.includes("1 questão anulada pelo INEP ficou fora da nota"),
    `autoScore ${scored?.autoScore}; ${text.slice(text.indexOf("Finalizada"), text.indexOf("Finalizada") + 160)}`,
  );

  group("Simulado (prova completa)");
  const exam2017 = await prisma.exam.findFirstOrThrow({
    where: { year: 2017 },
    select: {
      id: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          status: true,
          options: { select: { letter: true, isCorrect: true } },
        },
      },
    },
  });
  const exam2021 = await prisma.exam.findFirstOrThrow({
    where: { year: 2021 },
    select: { questions: { where: { type: "OBJECTIVE" }, take: 1, select: { id: true } } },
  });
  const simuladosOf = (email: string) =>
    prisma.attempt.findMany({
      where: { user: { email }, mode: "FULL_EXAM" },
      select: { id: true, status: true, autoScore: true },
    });
  await answerer.submitForm("/simulados", `value="${exam2017.id}"`, { examId: "nao-existe" });
  check(
    "começar simulado de prova inexistente não cria nada",
    (await simuladosOf(studentEmail)).length === 0,
  );
  reply = await answerer.submitForm("/simulados", `value="${exam2017.id}"`, {});
  await answerer.submitForm("/simulados", `value="${exam2017.id}"`, {});
  const startedSims = await simuladosOf(studentEmail);
  const simId = startedSims[0]?.id ?? "";
  const simPath = `/simulados/${simId}`;
  check(
    "começar duas vezes a mesma prova retoma o simulado em andamento",
    startedSims.length === 1 && reply.location.endsWith(simPath),
    `${startedSims.length} simulado(s); ${reply.location}`,
  );
  const exam2014 = await prisma.exam.findFirstOrThrow({
    where: { year: 2014 },
    select: { id: true },
  });
  const raceFields = await formFields(answerer, "/simulados", `value="${exam2014.id}"`);
  await Promise.all(
    Array.from({ length: 5 }, () => postFields(answerer, "/simulados", raceFields)),
  );
  const raced = await prisma.attempt.count({
    where: { user: { email: studentEmail }, mode: "FULL_EXAM", examId: exam2014.id },
  });
  check("5 cliques simultâneos em “Começar” criam um simulado só", raced === 1, `${raced}`);
  await prisma.attempt.deleteMany({
    where: { user: { email: studentEmail }, mode: "FULL_EXAM", examId: exam2014.id },
  });
  const validObjectives = exam2017.questions.filter(
    (question) => question.type === "OBJECTIVE" && question.status === "VALID",
  );
  const firstObjective = validObjectives[0];
  const firstPosition = exam2017.questions.indexOf(firstObjective) + 1;
  const annulledIn2017 = exam2017.questions.find((question) => question.status === "ANULADA");
  const discursiveIn2017 = exam2017.questions.find((question) => question.type === "DISCURSIVE");
  const simPage = await answerer.get(`${simPath}?q=${firstPosition}`);
  check(
    "gabarito não vai para a página do simulado",
    !/isCorrect|correctLetter/.test(simPage.body) &&
      !pageText(simPage.body).includes("alternativa correta"),
  );
  const discursivePage = await answerer.get(
    `${simPath}?q=${exam2017.questions.indexOf(discursiveIn2017!) + 1}`,
  );
  check(
    "padrão de resposta não vai para a página do simulado",
    !pageText(discursivePage.body).includes("Padrão de resposta") &&
      !discursivePage.body.includes("criteriaMd"),
  );
  const itemsOfSim = () =>
    prisma.attemptItem.findMany({
      where: { attemptId: simId },
      select: { questionId: true, selectedLetter: true, answerText: true, isCorrect: true },
    });
  const rightOf = (question: (typeof exam2017.questions)[number]) =>
    question.options.find((option) => option.isCorrect)?.letter ?? "A";
  reply = await answerer.submitForm(`${simPath}?q=${firstPosition}`, 'name="letter"', {
    letter: rightOf(firstObjective),
    isCorrect: "true",
  });
  check(
    "salvar resposta não devolve a correção e segue para a próxima",
    !/isCorrect|correctLetter|acertou|errou/i.test(pageText(reply.body)) &&
      reply.location.endsWith(`${simPath}?q=${firstPosition + 1}`),
    `${reply.status} ${reply.location}`,
  );
  let simItems = await itemsOfSim();
  check(
    "resposta salva sem correção enquanto o simulado está aberto",
    simItems.length === 1 && simItems[0].isCorrect === null,
  );
  await answerer.submitForm(`${simPath}?q=${firstPosition}`, 'name="letter"', {
    letter: rightOf(firstObjective) === "A" ? "B" : "A",
  });
  await answerer.submitForm(`${simPath}?q=${firstPosition}`, 'name="letter"', {
    letter: rightOf(firstObjective),
  });
  simItems = await itemsOfSim();
  check(
    "trocar a resposta atualiza a mesma linha (sem duplicar)",
    simItems.length === 1 && simItems[0].selectedLetter === rightOf(firstObjective),
  );
  for (const letter of ["Z", "", "AB"]) {
    await answerer.submitForm(`${simPath}?q=${firstPosition + 1}`, 'name="letter"', { letter });
  }
  await answerer.submitForm(`${simPath}?q=${firstPosition}`, 'name="letter"', {
    questionId: exam2021.questions[0].id,
    letter: "A",
  });
  await answerer.submitForm(`${simPath}?q=${firstPosition}`, 'name="letter"', {
    answerText: "texto numa objetiva",
    letter: "",
  });
  check(
    "letra inválida, questão de outra prova e texto em objetiva não gravam nada",
    JSON.stringify(await itemsOfSim()) === JSON.stringify(simItems),
  );
  reply = await intruder.get(simPath);
  const intruderResult = await intruder.get(`${simPath}/resultado`);
  check(
    "outro aluno não abre o simulado alheio",
    reply.status === 404 && intruderResult.status === 404,
  );
  const ownForm = await formFields(answerer, `${simPath}?q=${firstPosition}`, 'name="letter"');
  await postFields(intruder, `${simPath}?q=${firstPosition}`, {
    ...ownForm,
    letter: rightOf(firstObjective) === "A" ? "B" : "A",
  });
  const submitFields = await formFields(answerer, `${simPath}/entregar`, 'name="attemptId"');
  await postFields(intruder, `${simPath}/entregar`, submitFields);
  check(
    "outro aluno não responde nem entrega o simulado alheio (IDOR)",
    JSON.stringify(await itemsOfSim()) === JSON.stringify(simItems) &&
      (await simuladosOf(studentEmail))[0]?.status === "IN_PROGRESS",
  );
  const secondObjective = validObjectives[1];
  await answerer.submitForm(
    `${simPath}?q=${exam2017.questions.indexOf(secondObjective) + 1}`,
    'name="letter"',
    { letter: rightOf(secondObjective) === "A" ? "B" : "A" },
  );
  if (annulledIn2017) {
    await answerer.submitForm(
      `${simPath}?q=${exam2017.questions.indexOf(annulledIn2017) + 1}`,
      'name="letter"',
      { letter: "A" },
    );
  }
  await answerer.submitForm(
    `${simPath}?q=${exam2017.questions.indexOf(discursiveIn2017!) + 1}`,
    'name="answerText"',
    { answerText: "resposta do simulado" },
  );
  const beforeSubmit = pageText((await answerer.get(`${simPath}/entregar`)).body);
  check(
    "tela de entrega mostra quantas ficaram em branco",
    beforeSubmit.includes(`Você respondeu 4 de ${exam2017.questions.length} questões`) &&
      beforeSubmit.includes(`${exam2017.questions.length - 4} questões em branco`),
  );
  reply = await answerer.submitForm(`${simPath}/entregar`, 'name="attemptId"', {});
  const submitted = (await simuladosOf(studentEmail))[0];
  const graded = await itemsOfSim();
  const resultText = pageText((await answerer.get(`${simPath}/resultado`)).body);
  check(
    "entregar corrige no servidor; anulada fica fora da nota (1 de 2 = 50%)",
    submitted?.status === "SUBMITTED" &&
      submitted.autoScore === 50 &&
      reply.location.endsWith(`${simPath}/resultado`) &&
      graded.filter((item) => item.isCorrect === true).length === 1 &&
      resultText.includes("1 de 2 objetivas certas (50%)") &&
      (!annulledIn2017 || resultText.includes("1 questão anulada pelo INEP ficou fora da nota")),
    `autoScore ${submitted?.autoScore}; ${resultText.slice(resultText.indexOf("Simulado entregue"), resultText.indexOf("Simulado entregue") + 200)}`,
  );
  await postFields(answerer, `${simPath}?q=${firstPosition}`, {
    ...ownForm,
    letter: rightOf(firstObjective) === "A" ? "B" : "A",
  });
  await postFields(answerer, `${simPath}/entregar`, submitFields);
  check(
    "depois de entregar não dá para mudar resposta nem entregar de novo",
    JSON.stringify(await itemsOfSim()) === JSON.stringify(graded) &&
      (await simuladosOf(studentEmail))[0]?.autoScore === 50,
  );
  reply = await answerer.get(simPath);
  check(
    "simulado entregue redireciona para o resultado",
    reply.status === 307 && reply.location.endsWith(`${simPath}/resultado`),
    `${reply.status} ${reply.location}`,
  );
  check(
    "resposta do simulado não aparece como “última resposta” do modo estudo",
    !pageText((await answerer.get(`/questoes/${secondObjective.id}`)).body).includes(
      "Sua última resposta",
    ),
  );

  group("Simulado personalizado");
  const customOf = () =>
    prisma.attempt.findMany({
      where: { user: { email: studentEmail }, mode: "CUSTOM" },
      orderBy: { startedAt: "asc" },
      select: { id: true, status: true, questionIds: true, timeLimitSec: true, autoScore: true },
    });
  const build = (fields: Record<string, string>) =>
    answerer.submitForm("/simulados", 'name="quantidade"', {
      ano: "",
      area: "",
      tipo: "",
      tema: "",
      quantidade: "10",
      tempo: "",
      ...fields,
    });
  const forged: Record<string, string>[] = [
    { quantidade: "999" },
    { quantidade: "0" },
    { quantidade: "-5" },
    { quantidade: "2.5" },
    { tempo: "7" },
    { tempo: "99999" },
    { tipo: "HACK" },
    { area: "' OR 1=1 --" },
    { ano: "abc" },
    { tema: "x".repeat(500) },
  ];
  for (const fields of forged) {
    await build(fields);
  }
  reply = await build({ tema: "Tema que não existe" });
  check(
    "valores forjados e filtros sem questão não criam simulado",
    (await customOf()).length === 0 &&
      pageText(reply.body).includes("Nenhuma questão válida com esses filtros"),
  );
  reply = await build({ ano: "2017", tipo: "OBJECTIVE", quantidade: "40", tempo: "30" });
  let customs = await customOf();
  const custom = customs[0];
  const pickedQuestions = await prisma.question.findMany({
    where: { id: { in: custom?.questionIds ?? [] } },
    select: { status: true, type: true, exam: { select: { year: true } } },
  });
  check(
    "sorteio respeita filtros, sem anuladas e sem repetir questão",
    custom?.questionIds.length === validCount &&
      new Set(custom.questionIds).size === validCount &&
      pickedQuestions.length === validCount &&
      pickedQuestions.every(
        (question) =>
          question.status === "VALID" &&
          question.type === "OBJECTIVE" &&
          question.exam.year === 2017,
      ) &&
      custom.timeLimitSec === 1800,
    `${custom?.questionIds.length} de ${validCount}; tempo ${custom?.timeLimitSec}`,
  );
  const customPath = `/simulados/${custom?.id}`;
  check(
    "pediu mais do que existe: avisa quantas havia",
    reply.location.endsWith(`${customPath}?pedidas=40`) &&
      pageText((await answerer.get(reply.location.replace(BASE, ""))).body).includes(
        `Você pediu 40 questões, mas só havia ${validCount} válidas`,
      ),
    reply.location,
  );
  const customItems = () =>
    prisma.attemptItem.findMany({ where: { attemptId: custom?.id }, select: { id: true } });
  const customForm = await formFields(answerer, `${customPath}?q=1`, 'name="letter"');
  await postFields(answerer, `${customPath}?q=1`, {
    ...customForm,
    questionId: annulled?.id ?? "",
    letter: "A",
  });
  await postFields(answerer, `${customPath}?q=1`, {
    ...customForm,
    questionId: exam2021.questions[0].id,
    letter: "A",
  });
  check(
    "questão fora do sorteio (anulada ou de outra prova) não é gravada",
    (await customItems()).length === 0,
  );
  await postFields(intruder, `${customPath}?q=1`, { ...customForm, letter: "A" });
  check(
    "outro aluno não abre nem responde o simulado personalizado alheio",
    (await intruder.get(customPath)).status === 404 && (await customItems()).length === 0,
  );
  const firstPicked = await prisma.question.findUniqueOrThrow({
    where: { id: custom?.questionIds[0] },
    select: { options: { where: { isCorrect: true }, select: { letter: true } } },
  });
  await postFields(answerer, `${customPath}?q=1`, {
    ...customForm,
    letter: firstPicked.options[0]?.letter ?? "A",
  });
  const customSubmit = await formFields(answerer, `${customPath}/entregar`, 'name="attemptId"');
  await postFields(answerer, `${customPath}/entregar`, customSubmit);
  customs = await customOf();
  const customText = pageText((await answerer.get(`${customPath}/resultado`)).body);
  check(
    "entregar o personalizado dá a nota (1 de 1 = 100%) e conta as em branco",
    customs[0]?.status === "SUBMITTED" &&
      customs[0].autoScore === 100 &&
      customText.includes("1 de 1 objetiva certa (100%)") &&
      customText.includes(`${validCount - 1} questões ficaram em branco`),
    customText.slice(
      customText.indexOf("Simulado entregue"),
      customText.indexOf("Simulado entregue") + 160,
    ),
  );
  for (let index = 0; index < 7; index += 1) {
    await build({ quantidade: "5" });
  }
  customs = await customOf();
  reply = await build({ quantidade: "5" });
  check(
    "limite de 5 simulados personalizados abertos",
    customs.filter((attempt) => attempt.status === "IN_PROGRESS").length === 5 &&
      (await customOf()).length === customs.length &&
      pageText(reply.body).includes("5 simulados personalizados em andamento"),
  );

  group("Cronômetro do simulado");
  await prisma.attemptItem.deleteMany({
    where: { attempt: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" } },
  });
  await prisma.attempt.deleteMany({
    where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
  });
  const exam2021Id = (await prisma.exam.findFirstOrThrow({ where: { year: 2021 } })).id;
  await answerer.submitForm("/simulados", `value="${exam2021Id}"`, { tempo: "7" });
  await answerer.submitForm("/simulados", `value="${exam2021Id}"`, { tempo: "99999" });
  const replays2021 = () =>
    prisma.attempt.findMany({
      where: { user: { email: studentEmail }, mode: "FULL_EXAM", examId: exam2021Id },
      select: { id: true, timeLimitSec: true },
    });
  check("tempo forjado no replay não cria simulado", (await replays2021()).length === 0);
  await answerer.submitForm("/simulados", `value="${exam2021Id}"`, { tempo: "240" });
  const timedReplay = await replays2021();
  check(
    "replay com “4 h (como no ENADE)” grava o tempo",
    timedReplay.length === 1 && timedReplay[0].timeLimitSec === 14_400,
  );
  await prisma.attempt.deleteMany({ where: { id: { in: timedReplay.map((a) => a.id) } } });

  const newTimed = async () => {
    await build({ ano: "2017", tipo: "OBJECTIVE", quantidade: "5", tempo: "15" });
    const created = await prisma.attempt.findFirstOrThrow({
      where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: { id: true, questionIds: true },
    });
    return { ...created, path: `/simulados/${created.id}` };
  };
  const shiftStart = (id: string, secondsAgo: number) =>
    prisma.attempt.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - secondsAgo * 1000) },
    });
  const timed = await newTimed();
  const timedPage = await answerer.get(timed.path);
  check(
    "página do simulado com tempo mostra o cronômetro vindo do servidor",
    timedPage.body.includes('role="timer"') &&
      /Tempo restante (15:00|14:5\d)/.test(pageText(timedPage.body)),
    pageText(timedPage.body).match(/Tempo restante \S+/)?.[0],
  );
  const timedForm = await formFields(answerer, `${timed.path}?q=1`, 'name="letter"');
  const timedItems = () =>
    prisma.attemptItem.findMany({
      where: { attemptId: timed.id },
      orderBy: { questionId: "asc" },
      select: { questionId: true, selectedLetter: true },
    });
  await shiftStart(timed.id, 15 * 60 - 10);
  await postFields(answerer, `${timed.path}?q=1`, { ...timedForm, letter: "A" });
  check("faltando 10 s, salvar ainda funciona", (await timedItems()).length === 1);
  await shiftStart(timed.id, 15 * 60 + 5);
  await postFields(answerer, `${timed.path}?q=1`, { ...timedForm, letter: "B" });
  check(
    "salvar enviado no limite (5 s de atraso da rede) ainda é aceito",
    (await timedItems())[0]?.selectedLetter === "B",
  );
  await shiftStart(timed.id, 16 * 60);
  const beforeLate = await timedItems();
  reply = await postFields(answerer, `${timed.path}?q=1`, { ...timedForm, letter: "C" });
  const lateAttempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: timed.id },
    select: { status: true, startedAt: true, submittedAt: true },
  });
  check(
    "salvar 1 min depois do prazo é recusado e o simulado fecha no horário do prazo",
    JSON.stringify(await timedItems()) === JSON.stringify(beforeLate) &&
      lateAttempt.status === "SUBMITTED" &&
      lateAttempt.submittedAt?.getTime() === lateAttempt.startedAt.getTime() + 15 * 60 * 1000 &&
      reply.location.endsWith(`${timed.path}/resultado`),
    `${lateAttempt.status} ${reply.status} ${reply.location}`,
  );
  check(
    "resultado avisa que o tempo esgotou",
    pageText((await answerer.get(`${timed.path}/resultado`)).body).includes(
      "Tempo esgotado: o simulado foi entregue automaticamente",
    ),
  );
  const openedLate = await newTimed();
  await shiftStart(openedLate.id, 20 * 60);
  reply = await answerer.get(openedLate.path);
  check(
    "abrir um simulado vencido fecha e leva ao resultado",
    reply.status === 307 &&
      reply.location.endsWith(`${openedLate.path}/resultado`) &&
      (await prisma.attempt.findUniqueOrThrow({ where: { id: openedLate.id } })).status ===
        "SUBMITTED",
    `${reply.status} ${reply.location}`,
  );
  const listedLate = await newTimed();
  await shiftStart(listedLate.id, 20 * 60);
  await answerer.get("/simulados");
  check(
    "abrir a lista de simulados fecha os vencidos",
    (await prisma.attempt.findUniqueOrThrow({ where: { id: listedLate.id } })).status ===
      "SUBMITTED",
  );
  const submitLate = await newTimed();
  const submitLateFields = await formFields(
    answerer,
    `${submitLate.path}/entregar`,
    'name="attemptId"',
  );
  await shiftStart(submitLate.id, 30 * 60);
  await postFields(answerer, `${submitLate.path}/entregar`, submitLateFields);
  const submittedLate = await prisma.attempt.findUniqueOrThrow({
    where: { id: submitLate.id },
    select: { startedAt: true, submittedAt: true },
  });
  check(
    "entregar depois do prazo registra a entrega no horário do prazo, não depois",
    submittedLate.submittedAt?.getTime() === submittedLate.startedAt.getTime() + 15 * 60 * 1000,
  );

  group("Filtros múltiplos do simulado personalizado");
  const buildMulti = async (entries: [string, string][]) => {
    const hidden = await formFields(answerer, "/simulados", 'name="quantidade"');
    const data = new FormData();
    for (const [key, value] of Object.entries(hidden)) {
      data.append(key, value);
    }
    for (const [key, value] of entries) {
      data.append(key, value);
    }
    return answerer.request("/simulados", { method: "POST", body: data }, { origin: BASE });
  };
  const openCustoms = () =>
    prisma.attempt.findMany({
      where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
      select: { id: true, questionIds: true },
    });
  const customsBefore = (await openCustoms()).length;
  await buildMulti([
    ...Array.from({ length: 31 }, (_, index): [string, string] => ["ano", String(2000 + index)]),
    ["quantidade", "10"],
  ]);
  await buildMulti([
    ["tema", "x".repeat(500)],
    ["quantidade", "10"],
  ]);
  await buildMulti([
    ["ano", "2017"],
    ["ano", "abc"],
    ["quantidade", "10"],
  ]);
  check(
    "listas forjadas (31 anos, tema enorme, ano inválido no meio) não criam simulado",
    (await openCustoms()).length === customsBefore,
  );
  const multiTopics = ["Redes de Computadores", "Sistemas Operacionais"];
  const expectedIds = (
    await prisma.question.findMany({
      where: {
        status: "VALID",
        exam: { year: { in: [2014, 2017, 2021] } },
        tags: { some: { topic: { name: { in: multiTopics } } } },
      },
      select: { id: true },
    })
  )
    .map((question) => question.id)
    .sort();
  reply = await buildMulti([
    ["ano", "2014"],
    ["ano", "2017"],
    ["ano", "2021"],
    ["ano", "2017"],
    ["tema", multiTopics[0]],
    ["tema", multiTopics[1]],
    ["quantidade", "40"],
  ]);
  const multiCreated = (await openCustoms()).find(
    (attempt) => !reply.location || reply.location.includes(attempt.id),
  );
  check(
    "vários anos e vários temas juntos: sorteia exatamente as que batem",
    expectedIds.length > 0 &&
      JSON.stringify([...(multiCreated?.questionIds ?? [])].sort()) === JSON.stringify(expectedIds),
    `${multiCreated?.questionIds.length} de ${expectedIds.length}`,
  );

  group("Resultado e revisão do simulado");
  const simResultText = pageText((await answerer.get(`${simPath}/resultado`)).body);
  const wrongTopics = (
    await prisma.question.findUniqueOrThrow({
      where: { id: secondObjective.id },
      select: { tags: { select: { topic: { select: { name: true } } } } },
    })
  ).tags.map((tag) => tag.topic.name);
  check(
    "resultado mostra “Onde estudar mais” com o tema da questão errada para revisar",
    simResultText.includes("Onde estudar mais") &&
      wrongTopics.some((topic) => simResultText.includes(`${topic} Revisar`)),
    wrongTopics.join(", "),
  );
  const wrongOnly = pageText((await answerer.get(`${simPath}/resultado?ver=erradas`)).body);
  check(
    "filtro “Erradas” lista só a errada",
    (wrongOnly.match(/Errou Questão/g) ?? []).length === 1 &&
      !wrongOnly.includes("Acertou Questão"),
  );
  const reviewWrong = await answerer.get(
    `${simPath}/revisao?q=${exam2017.questions.indexOf(secondObjective) + 1}`,
  );
  check(
    "revisão da questão errada mostra a marcada e a correta",
    pageText(reviewWrong.body).includes(
      `Você errou. Você marcou a ${rightOf(secondObjective) === "A" ? "B" : "A"}; a alternativa correta é a ${rightOf(secondObjective)}.`,
    ),
  );
  reply = await intruder.get(`${simPath}/revisao?q=1`);
  check("outro aluno não abre a revisão alheia", reply.status === 404);
  const openDisc = await (async () => {
    await build({ tipo: "DISCURSIVE", quantidade: "5" });
    const created = await prisma.attempt.findFirstOrThrow({
      where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: { id: true, questionIds: true },
    });
    return { ...created, path: `/simulados/${created.id}` };
  })();
  reply = await answerer.get(`${openDisc.path}/revisao?q=1`);
  check(
    "revisão de simulado ainda aberto não existe (sem padrão antes da entrega)",
    reply.status === 404 && !pageText(reply.body).includes("Padrão de resposta oficial"),
  );
  await answerer.submitForm(`${openDisc.path}?q=1`, 'name="answerText"', {
    answerText: "resposta aberta",
  });
  const openDiscItem = await prisma.attemptItem.findFirstOrThrow({
    where: { attemptId: openDisc.id },
    select: { id: true, questionId: true },
  });
  const slotsForQuestion = async (questionId: string) => {
    const question = await prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      select: { valuePoints: true, answerStandards: { select: { subItem: true, maxScore: true } } },
    });
    return slotsFor(question.valuePoints, question.answerStandards);
  };
  const scoreFields = async (questionId: string) =>
    Object.fromEntries(
      (await slotsForQuestion(questionId)).map((slot) => [`score_${slot.key}`, String(slot.max)]),
    );
  await postFields(answerer, discursivePath, {
    ...selfEvalFields,
    itemId: openDiscItem.id,
    ...(await scoreFields(openDiscItem.questionId)),
  });
  check(
    "autoavaliação em simulado ainda aberto é recusada",
    (await prisma.attemptItem.findUniqueOrThrow({ where: { id: openDiscItem.id } })).selfScore ===
      null,
  );
  const simDiscItem = await prisma.attemptItem.findFirstOrThrow({
    where: { attemptId: simId, answerText: { not: null } },
    select: { id: true, questionId: true },
  });
  const simDiscScores = await scoreFields(simDiscItem.questionId);
  await postFields(intruder, discursivePath, {
    ...selfEvalFields,
    itemId: simDiscItem.id,
    ...simDiscScores,
  });
  check(
    "outro aluno não autoavalia a discursiva do simulado alheio",
    (await prisma.attemptItem.findUniqueOrThrow({ where: { id: simDiscItem.id } })).selfScore ===
      null,
  );
  const discPosition = exam2017.questions.indexOf(discursiveIn2017!) + 1;
  const discReview = await answerer.get(`${simPath}/revisao?q=${discPosition}`);
  await answerer.submitForm(`${simPath}/revisao?q=${discPosition}`, 'name="itemId"', simDiscScores);
  const maxTotal = Object.values(simDiscScores).reduce((sum, value) => sum + Number(value), 0);
  check(
    "depois de entregar: revisão mostra o padrão e a autoavaliação é salva",
    pageText(discReview.body).includes("Padrão de resposta oficial") &&
      (await prisma.attemptItem.findUniqueOrThrow({ where: { id: simDiscItem.id } })).selfScore ===
        maxTotal &&
      pageText((await answerer.get(`${simPath}/resultado`)).body).includes(
        `Discursivas autoavaliadas: ${maxTotal.toLocaleString("pt-BR")} de ${maxTotal.toLocaleString("pt-BR")} pontos`,
      ),
  );

  group("Histórico");
  const topicSection = (html: string) => {
    const text = pageText(html);
    const start = text.indexOf("Desempenho por tema");
    return text.slice(start, text.indexOf("Tentativas encerradas", start));
  };
  const expectedTopics = async () => {
    const items = await prisma.attemptItem.findMany({
      where: {
        attempt: {
          user: { email: studentEmail },
          mode: { in: ["PRACTICE", "FULL_EXAM", "CUSTOM"] },
        },
        selectedLetter: { not: null },
        revealedAt: { not: null },
        question: { status: "VALID" },
      },
      select: {
        selectedLetter: true,
        question: {
          select: {
            options: { where: { isCorrect: true }, select: { letter: true } },
            tags: { select: { topic: { select: { name: true } } } },
          },
        },
      },
    });
    const totals = new Map<string, { correct: number; total: number }>();
    for (const item of items) {
      for (const tag of item.question.tags) {
        const entry = totals.get(tag.topic.name) ?? { correct: 0, total: 0 };
        entry.total += 1;
        if (item.selectedLetter === item.question.options[0]?.letter) entry.correct += 1;
        totals.set(tag.topic.name, entry);
      }
    }
    return totals;
  };
  const dashboardSection = (html: string) => {
    const text = pageText(html);
    return text.slice(
      text.indexOf("Olá"),
      text.indexOf("Questões Resolva") > 0 ? text.indexOf("Questões Resolva") : undefined,
    );
  };
  const dashboardBefore = dashboardSection((await answerer.get("/")).body);
  const historyBefore = await answerer.get("/historico");
  const expected = await expectedTopics();
  const beforeSection = topicSection(historyBefore.body);
  check(
    "histórico por tema bate com o cálculo feito direto no banco",
    historyBefore.status === 200 &&
      expected.size > 0 &&
      [...expected].every(([topic, { correct, total }]) => {
        const at = beforeSection.indexOf(`${topic} `);
        return (
          at >= 0 &&
          beforeSection.slice(at, at + topic.length + 60).includes(`${correct} de ${total} certas`)
        );
      }),
    [...expected].map(([topic, value]) => `${topic} ${value.correct}/${value.total}`).join("; "),
  );
  const historyText = pageText(historyBefore.body);
  check(
    "histórico lista o simulado entregue com a nota",
    historyText.includes("Prova completa 2017") &&
      historyBefore.body.includes(`/simulados/${simId}/resultado`),
  );
  await build({ ano: "2017", tipo: "OBJECTIVE", quantidade: "5" });
  const peekSim = await prisma.attempt.findFirstOrThrow({
    where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { id: true, questionIds: true },
  });
  const peekQuestion = await prisma.question.findUniqueOrThrow({
    where: { id: peekSim.questionIds[0] },
    select: { options: { where: { isCorrect: true }, select: { letter: true } } },
  });
  await answerer.submitForm(`/simulados/${peekSim.id}?q=1`, 'name="letter"', {
    letter: peekQuestion.options[0]?.letter ?? "A",
  });
  const dashboardAfter = dashboardSection((await answerer.get("/")).body);
  check(
    "painel inicial mostra o desempenho e não muda com resposta de simulado aberto",
    dashboardBefore.includes("questões respondidas") &&
      dashboardBefore.includes("de acerto nas objetivas") &&
      dashboardAfter.replace(/Simulado em andamento: \d+ de \d+ respondidas Continuar →/, "") ===
        dashboardBefore.replace(/Simulado em andamento: \d+ de \d+ respondidas Continuar →/, ""),
    dashboardBefore.slice(0, 160),
  );
  check(
    "resposta de simulado aberto não entra no histórico (não dá para espiar se acertou)",
    topicSection((await answerer.get("/historico")).body) === beforeSection,
  );
  const intruderHistory = await intruder.get("/historico");
  check(
    "outro aluno não vê o histórico alheio",
    intruderHistory.status === 200 &&
      !intruderHistory.body.includes(simId) &&
      !intruderHistory.body.includes(peekSim.id),
  );
  let paginationOk = true;
  for (const pagina of ["-5", "abc", "99999", "1e9", "' OR 1=1 --"]) {
    const response = await answerer.get(`/historico?pagina=${encodeURIComponent(pagina)}`);
    paginationOk &&= response.status === 200 && noLeak(response.body);
  }
  check("paginação forjada no histórico não quebra a página", paginationOk);

  group("Questões em rascunho (não publicadas)");
  const SECRET = "ENUNCIADO-SECRETO-DO-RASCUNHO";
  const soTopic = await prisma.topic.findUniqueOrThrow({
    where: { name: "Sistemas Operacionais" },
  });
  const draftObjective = await prisma.question.create({
    data: {
      examId: exam2017.id,
      originalLabel: `${DRAFT_LABEL}-O`,
      order: 999,
      type: "OBJECTIVE",
      area: "COMPONENTE_ESPECIFICO",
      statementMd: `${SECRET} objetiva`,
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
  const draftDiscursive = await prisma.question.create({
    data: {
      examId: exam2017.id,
      originalLabel: `${DRAFT_LABEL}-D`,
      order: 998,
      type: "DISCURSIVE",
      area: "COMPONENTE_ESPECIFICO",
      statementMd: `${SECRET} discursiva`,
      answerStandards: { create: { criteriaMd: `${SECRET} padrão` } },
      tags: { create: { topicId: soTopic.id } },
    },
    select: { id: true },
  });
  const draftIds = [draftObjective.id, draftDiscursive.id];
  const publishedSo = await prisma.question.count({
    where: { publishedAt: { not: null }, tags: { some: { topicId: soTopic.id } } },
  });
  const soList = await answerer.get(
    `/questoes?tema=${encodeURIComponent("Sistemas Operacionais")}&status=TODAS`,
  );
  check(
    "rascunho não aparece na lista nem na contagem",
    !soList.body.includes(SECRET) &&
      pageText(soList.body).includes(`${publishedSo} questões encontradas`),
  );
  const detailReplies = await Promise.all(draftIds.map((id) => answerer.get(`/questoes/${id}`)));
  check(
    "abrir o rascunho pelo link direto dá 404 sem vazar o texto",
    detailReplies.every((response) => response.status === 404 && !response.body.includes(SECRET)),
  );
  const lastObjective = await prisma.question.findFirstOrThrow({
    where: { examId: exam2017.id, type: "OBJECTIVE", publishedAt: { not: null } },
    orderBy: { order: "desc" },
    select: { id: true },
  });
  const lastDiscursive = await prisma.question.findFirstOrThrow({
    where: { examId: exam2017.id, type: "DISCURSIVE", publishedAt: { not: null } },
    orderBy: { order: "desc" },
    select: { id: true },
  });
  const neighbours = await Promise.all(
    [lastObjective.id, lastDiscursive.id].map((id) => answerer.get(`/questoes/${id}`)),
  );
  check(
    "“anterior/próxima” não leva ao rascunho",
    neighbours.every((response) => draftIds.every((id) => !response.body.includes(id))),
  );
  await answerer.submitForm(answerPath, 'name="letter"', {
    questionId: draftObjective.id,
    letter: "A",
  });
  await answerer.submitForm(`${discursivePath}?nova=1`, 'name="answerText"', {
    questionId: draftDiscursive.id,
    answerText: "tentando responder o rascunho",
  });
  check(
    "responder rascunho forjando o questionId não grava nada",
    (await prisma.attemptItem.count({ where: { questionId: { in: draftIds } } })) === 0,
  );
  await prisma.attemptItem.deleteMany({
    where: { attempt: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" } },
  });
  await prisma.attempt.deleteMany({
    where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
  });
  const simuladosPage = await answerer.get("/simulados");
  const validPublishedSo = await prisma.question.count({
    where: {
      publishedAt: { not: null },
      status: "VALID",
      tags: { some: { topicId: soTopic.id } },
    },
  });
  check(
    "contagem do simulado personalizado ignora o rascunho",
    pageText(simuladosPage.body).includes(`Sistemas Operacionais (${validPublishedSo})`) &&
      !simuladosPage.body.includes(SECRET),
    pageText(simuladosPage.body).match(/Sistemas Operacionais \(\d+\)/)?.[0],
  );
  await buildMulti([
    ["tema", "Sistemas Operacionais"],
    ["quantidade", "40"],
  ]);
  const drawn = await prisma.attempt.findFirstOrThrow({
    where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { questionIds: true },
  });
  await prisma.attempt.deleteMany({
    where: {
      user: { email: studentEmail },
      mode: "FULL_EXAM",
      examId: exam2017.id,
      status: "IN_PROGRESS",
    },
  });
  await answerer.submitForm("/simulados", `value="${exam2017.id}"`, {});
  const replayWithDrafts = await prisma.attempt.findFirstOrThrow({
    where: {
      user: { email: studentEmail },
      mode: "FULL_EXAM",
      examId: exam2017.id,
      status: "IN_PROGRESS",
    },
    select: { questionIds: true },
  });
  check(
    "sorteio e prova completa não incluem rascunho",
    drawn.questionIds.length === validPublishedSo &&
      draftIds.every((id) => !drawn.questionIds.includes(id)) &&
      replayWithDrafts.questionIds.length === 40 &&
      draftIds.every((id) => !replayWithDrafts.questionIds.includes(id)) &&
      pageText(simuladosPage.body).includes("40 questões"),
    `sorteio ${drawn.questionIds.length}; prova ${replayWithDrafts.questionIds.length}`,
  );

  group("Painel do admin: editor de questões");
  const editDraft = await prisma.question.create({
    data: {
      examId: exam2017.id,
      originalLabel: `${DRAFT_LABEL}-E`,
      order: 997,
      type: "OBJECTIVE",
      area: "COMPONENTE_ESPECIFICO",
      statementMd: "Enunciado original do rascunho de edição",
      options: {
        create: ["A", "B", "C", "D", "E"].map((letter) => ({
          letter,
          textMd: `original ${letter}`,
          isCorrect: letter === "A",
        })),
      },
      tags: { create: { topicId: soTopic.id } },
    },
    select: { id: true },
  });
  const editPath = `/admin/questoes/${editDraft.id}`;
  const anonAdmin = new Client("10.70.0.1");
  const adminPages = ["/admin", `/admin/provas/${exam2017.id}`, editPath];
  const blocked = await Promise.all(
    adminPages.flatMap((path) => [answerer.get(path), anonAdmin.get(path)]),
  );
  check(
    "aluno e visitante recebem 404 em todas as páginas do painel",
    blocked.every((response) => response.status === 404 && !response.body.includes("statementMd")),
    blocked.map((response) => response.status).join(","),
  );
  group("Portais de login (estudante × administrador)");
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "admin123";
  const adminAtStudentPortal = new Client("10.72.0.1");
  reply = await pageLogin(adminAtStudentPortal, adminEmail, adminPassword);
  check(
    "admin pela tela de estudante é recusado com a mensagem genérica",
    (await adminAtStudentPortal.session()) === null &&
      pageText(reply.body).includes("E-mail ou senha incorretos"),
  );
  const studentAtAdminPortal = new Client("10.72.0.2");
  reply = await studentAtAdminPortal.submit("/admin/entrar", {
    email: studentEmail,
    password: studentPassword,
  });
  check(
    "estudante pela tela de admin é recusado com a mensagem genérica",
    (await studentAtAdminPortal.session()) === null &&
      pageText(reply.body).includes("E-mail ou senha incorretos"),
  );
  const apiAdmin = new Client("10.72.0.3");
  await apiAdmin.apiLogin(adminEmail, adminPassword);
  const apiStudentForged = new Client("10.72.0.4");
  await apiStudentForged.apiLogin(studentEmail, studentPassword, { portal: "admin" });
  check(
    "API de login direta: admin sem portal não entra e estudante com portal=admin forjado também não",
    (await apiAdmin.session()) === null && (await apiStudentForged.session()) === null,
  );
  const publicPages = await Promise.all(
    ["/", "/login", "/cadastro"].map((path) => new Client("10.72.0.5").get(path)),
  );
  check(
    "nenhuma página pública tem link para o login do admin",
    publicPages.every((page) => page.status === 200 && !page.body.includes("/admin/entrar")),
  );
  const admin = new Client("10.70.0.2");
  reply = await admin.submit("/admin/entrar", { email: adminEmail, password: adminPassword });
  check(
    "admin entra pela tela própria e cai no painel",
    (await admin.session())?.user.role === "ADMIN" && reply.location.endsWith("/admin"),
    reply.location,
  );
  const editorPage = await admin.get(editPath);
  check(
    "admin abre o editor",
    editorPage.status === 200 && editorPage.body.includes('name="statementMd"'),
    `${editorPage.status}`,
  );
  const editorHidden = await formFields(admin, editPath, 'name="statementMd"');
  const withTopics = (entries: [string, string][], topics: string[]) => {
    return async (client: Client, hidden = editorHidden) => {
      const data = new FormData();
      for (const [key, value] of Object.entries(hidden)) {
        data.append(key, value);
      }
      for (const [key, value] of entries) {
        data.set(key, value);
      }
      for (const topic of topics) {
        data.append("topic", topic);
      }
      return client.request(editPath, { method: "POST", body: data }, { origin: BASE });
    };
  };
  const baseEdit: [string, string][] = [
    ["statementMd", "Enunciado editado pelo painel"],
    ["area", "COMPONENTE_ESPECIFICO"],
    ["status", "VALID"],
    ["valuePoints", ""],
    ...["A", "B", "C", "D", "E"].map((letter): [string, string] => [
      `option_${letter}`,
      `editada ${letter}`,
    ]),
    ["correct", "B"],
  ];
  const draftState = () =>
    prisma.question.findUniqueOrThrow({
      where: { id: editDraft.id },
      select: {
        statementMd: true,
        status: true,
        updatedAt: true,
        options: { orderBy: { letter: "asc" }, select: { textMd: true, isCorrect: true } },
        tags: { select: { topic: { select: { name: true } } } },
      },
    });
  const original = JSON.stringify(await draftState());
  await withTopics(baseEdit, ["Sistemas Operacionais"])(answerer);
  await withTopics(baseEdit, ["Sistemas Operacionais"])(anonAdmin);
  check(
    "aluno e visitante reaproveitando o formulário do admin não alteram nada",
    JSON.stringify(await draftState()) === original,
  );
  const invalidEdits: [string, [string, string][], string[]][] = [
    ["correta inexistente", [...baseEdit, ["correct", "Z"]], ["Sistemas Operacionais"]],
    ["situação forjada", [...baseEdit, ["status", "HACK"]], ["Sistemas Operacionais"]],
    ["área forjada", [...baseEdit, ["area", "' OR 1=1 --"]], ["Sistemas Operacionais"]],
    ["enunciado vazio", [...baseEdit, ["statementMd", "   "]], ["Sistemas Operacionais"]],
    [
      "enunciado gigante",
      [...baseEdit, ["statementMd", "x".repeat(20_001)]],
      ["Sistemas Operacionais"],
    ],
    ["alternativa vazia", [...baseEdit, ["option_C", ""]], ["Sistemas Operacionais"]],
    ["válida sem correta", [...baseEdit, ["correct", ""]], ["Sistemas Operacionais"]],
    ["tema inexistente", baseEdit, ["Tema Inventado"]],
    ["sem tema", baseEdit, []],
    [
      "padrão de resposta numa objetiva",
      [
        ...baseEdit,
        ["standardId", ""],
        ["standardSubItem", "a"],
        ["standardMaxScore", "5"],
        ["standardCriteria", "x"],
      ],
      ["Sistemas Operacionais"],
    ],
  ];
  const acceptedInvalid: string[] = [];
  for (const [label, entries, topics] of invalidEdits) {
    await withTopics(entries, topics)(admin);
    if (JSON.stringify(await draftState()) !== original) {
      acceptedInvalid.push(label);
    }
  }
  check(
    "admin: 10 envios inválidos são recusados sem alterar a questão",
    acceptedInvalid.length === 0,
    acceptedInvalid.join(", "),
  );
  reply = await withTopics(baseEdit, ["Sistemas Operacionais", "Redes de Computadores"])(admin);
  const edited = await draftState();
  check(
    "admin salva: enunciado, alternativas, correta e temas atualizados",
    edited.statementMd === "Enunciado editado pelo painel" &&
      edited.options.map((option) => option.textMd).join("|") ===
        "editada A|editada B|editada C|editada D|editada E" &&
      edited.options.map((option) => option.isCorrect).join(",") ===
        "false,true,false,false,false" &&
      edited.tags.length === 2 &&
      reply.location.endsWith(`${editPath}?salvo=1`),
    `${reply.status} ${reply.location}`,
  );
  await withTopics(
    [...baseEdit, ["statementMd", "sobrescrita com versão velha"]],
    ["Sistemas Operacionais"],
  )(admin);
  check(
    "salvar com a versão velha da página (outra aba) é recusado",
    (await draftState()).statementMd === "Enunciado editado pelo painel",
  );
  const freshHidden = await formFields(admin, editPath, 'name="statementMd"');
  await withTopics(
    [
      ...baseEdit,
      ["statementMd", '<script>alert(1)</script> <img src=x onerror="alert(2)"> texto'],
    ],
    ["Sistemas Operacionais"],
  )(admin, freshHidden);
  const xssPage = await admin.get(editPath);
  check(
    "HTML no enunciado salvo aparece escapado no painel",
    !xssPage.body.includes("<script>alert(1)</script>") &&
      !xssPage.body.includes('<img src=x onerror="alert(2)">') &&
      xssPage.body.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
  );
  const discDraft = await prisma.question.create({
    data: {
      examId: exam2017.id,
      originalLabel: `${DRAFT_LABEL}-F`,
      order: 996,
      type: "DISCURSIVE",
      area: "COMPONENTE_ESPECIFICO",
      statementMd: "Discursiva de edição",
      valuePoints: 10,
      answerStandards: { create: { subItem: "a", maxScore: 10, criteriaMd: "padrão a" } },
      tags: { create: { topicId: soTopic.id } },
    },
    select: { id: true, answerStandards: { select: { id: true } } },
  });
  const discPath = `/admin/questoes/${discDraft.id}`;
  const foreignStandard = await prisma.answerStandard.findFirstOrThrow({
    where: { questionId: { not: discDraft.id }, question: { publishedAt: { not: null } } },
    select: { id: true, criteriaMd: true },
  });
  const discHidden = await formFields(admin, discPath, 'name="statementMd"');
  const postDisc = (standards: [string, string, string, string][], hidden = discHidden) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(hidden)) {
      if (key !== "standardId") {
        data.append(key, value);
      }
    }
    data.set("statementMd", "Discursiva editada");
    data.set("area", "COMPONENTE_ESPECIFICO");
    data.set("status", "VALID");
    data.set("valuePoints", "10");
    data.append("topic", "Sistemas Operacionais");
    for (const [id, subItem, maxScore, criteria] of standards) {
      data.append("standardId", id);
      data.append("standardSubItem", subItem);
      data.append("standardMaxScore", maxScore);
      data.append("standardCriteria", criteria);
    }
    return admin.request(discPath, { method: "POST", body: data }, { origin: BASE });
  };
  await postDisc([[foreignStandard.id, "a", "10", "SEQUESTRADO"]]);
  await postDisc([
    [discDraft.answerStandards[0].id, "a", "5", "x"],
    ["", "a", "5", "y"],
  ]);
  check(
    "item de padrão de outra questão (IDOR) e subitem repetido são recusados",
    (await prisma.answerStandard.findUniqueOrThrow({ where: { id: foreignStandard.id } }))
      .criteriaMd === foreignStandard.criteriaMd &&
      (await prisma.question.findUniqueOrThrow({ where: { id: discDraft.id } })).statementMd ===
        "Discursiva de edição",
  );
  await postDisc([
    [discDraft.answerStandards[0].id, "a", "6", "padrão a editado"],
    ["", "b", "4", "padrão b novo"],
  ]);
  const discStandards = await prisma.answerStandard.findMany({
    where: { questionId: discDraft.id },
    orderBy: { subItem: "asc" },
    select: { id: true, subItem: true, maxScore: true, criteriaMd: true },
  });
  check(
    "admin edita item existente e adiciona item novo no padrão de resposta",
    discStandards.length === 2 &&
      discStandards[0].id === discDraft.answerStandards[0].id &&
      discStandards[0].criteriaMd === "padrão a editado" &&
      discStandards[0].maxScore === 6 &&
      discStandards[1].subItem === "b" &&
      discStandards[1].maxScore === 4,
    JSON.stringify(discStandards.map((item) => [item.subItem, item.maxScore])),
  );

  group("Imagens pelo painel");
  const upload = (
    client: Client,
    questionId: string,
    file: { bytes: Buffer; name: string; type: string } | null,
    fields: Record<string, string> = {},
    headers: Record<string, string> = { origin: BASE, "sec-fetch-site": "same-origin" },
  ) => {
    const data = new FormData();
    if (file) {
      data.append(
        "arquivo",
        new Blob([new Uint8Array(file.bytes)], { type: file.type }),
        file.name,
      );
    }
    for (const [key, value] of Object.entries(fields)) {
      data.append(key, value);
    }
    return client.request(
      `/admin/imagens?questao=${encodeURIComponent(questionId)}`,
      { method: "POST", body: data },
      headers,
    );
  };
  const assetsOf = (questionId: string) =>
    prisma.asset.findMany({
      where: { questionId },
      orderBy: [{ answerStandardId: "asc" }, { position: "asc" }],
      select: { id: true, filePath: true, position: true, caption: true, answerStandardId: true },
    });
  const goodPng = { bytes: makePng(40, 20), name: "figura.png", type: "image/png" };
  const filesBefore = uploadFiles().length;
  const denied = await Promise.all([
    upload(answerer, editDraft.id, goodPng),
    upload(anonAdmin, editDraft.id, goodPng),
  ]);
  check(
    "aluno e visitante recebem 404 ao enviar imagem e nada é gravado",
    denied.every((response) => response.status === 404) &&
      (await assetsOf(editDraft.id)).length === 0 &&
      uploadFiles().length === filesBefore,
  );
  reply = await upload(
    admin,
    editDraft.id,
    goodPng,
    {},
    {
      origin: "https://site-do-atacante.example",
      "sec-fetch-site": "cross-site",
    },
  );
  const crossSite = await upload(
    admin,
    editDraft.id,
    goodPng,
    {},
    {
      origin: BASE,
      "sec-fetch-site": "cross-site",
    },
  );
  check(
    "envio vindo de outro site (CSRF) é recusado",
    reply.location.includes("erro=origem") &&
      crossSite.location.includes("erro=origem") &&
      (await assetsOf(editDraft.id)).length === 0,
    reply.location,
  );
  reply = await upload(admin, editDraft.id, goodPng, { legenda: "Figura enviada" });
  const uploaded = await assetsOf(editDraft.id);
  const uploadedName = uploaded[0]?.filePath.replace("uploads/", "") ?? "";
  const served = await anonAdmin.request(`/imagens/${uploadedName}`);
  const servedHeaders = await fetch(`${BASE}/imagens/${uploadedName}`);
  check(
    "admin envia PNG: gravado com nome aleatório e servido com tipo certo e nosniff",
    reply.location.includes("imagem=ok") &&
      uploaded.length === 1 &&
      /^uploads\/[a-f0-9]{24}\.png$/.test(uploaded[0].filePath) &&
      uploadFiles().includes(uploadedName) &&
      served.status === 200 &&
      servedHeaders.headers.get("content-type") === "image/png" &&
      servedHeaders.headers.get("x-content-type-options") === "nosniff" &&
      (servedHeaders.headers.get("content-security-policy") ?? "").includes("sandbox") &&
      Buffer.from(await servedHeaders.arrayBuffer()).equals(goodPng.bytes),
    `${reply.location} ${uploaded[0]?.filePath}`,
  );
  const hugeDims = makePng(1, 1);
  hugeDims.writeUInt32BE(7000, 16);
  hugeDims.writeUInt32BE(7000, 20);
  const fakes: [string, { bytes: Buffer; name: string; type: string }][] = [
    [
      "texto com nome .png",
      { bytes: Buffer.from("isto não é imagem"), name: "a.png", type: "image/png" },
    ],
    [
      "SVG com script",
      {
        bytes: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
        name: "a.svg",
        type: "image/svg+xml",
      },
    ],
    [
      "HTML disfarçado de JPEG",
      {
        bytes: Buffer.from("<html><script>alert(1)</script></html>"),
        name: "a.jpg",
        type: "image/jpeg",
      },
    ],
    ["GIF", { bytes: Buffer.from("GIF89a\x01\x00\x01\x00"), name: "a.gif", type: "image/gif" }],
    ["PNG de 7000×7000", { bytes: hugeDims, name: "big.png", type: "image/png" }],
  ];
  const acceptedFakes: string[] = [];
  for (const [label, file] of fakes) {
    const response = await upload(admin, editDraft.id, file);
    if (!response.location.includes("erro=tipo"))
      acceptedFakes.push(`${label} (${response.location})`);
  }
  const oversized = Buffer.concat([makePng(10, 10), Buffer.alloc(2.5 * 1024 * 1024)]);
  reply = await upload(admin, editDraft.id, {
    bytes: oversized,
    name: "grande.png",
    type: "image/png",
  });
  check(
    "arquivos falsos, SVG, GIF, dimensões absurdas e acima de 2 MB são recusados",
    acceptedFakes.length === 0 &&
      reply.location.includes("erro=grande") &&
      (await assetsOf(editDraft.id)).length === 1 &&
      uploadFiles().length === filesBefore + 1,
    `${acceptedFakes.join("; ")} | grande: ${reply.location}`,
  );
  const foreignAsset = await prisma.asset.findFirstOrThrow({
    where: { questionId: { not: editDraft.id } },
    select: { id: true, filePath: true },
  });
  const idorItem = await upload(admin, editDraft.id, goodPng, {
    item: discDraft.answerStandards[0].id,
  });
  const idorReplace = await upload(admin, editDraft.id, goodPng, { substituir: foreignAsset.id });
  check(
    "anexar em item de outra questão ou substituir imagem alheia (IDOR) é recusado",
    idorItem.location.includes("erro=alvo") &&
      idorReplace.location.includes("erro=alvo") &&
      (await prisma.asset.findUniqueOrThrow({ where: { id: foreignAsset.id } })).filePath ===
        foreignAsset.filePath &&
      uploadFiles().length === filesBefore + 1,
  );
  let traversalOk = true;
  for (const path of [
    "/imagens/..%2F..%2F.env",
    "/imagens/%2e%2e%2fpackage.json",
    `/imagens/${"0".repeat(24)}.png`,
    `/imagens/${uploadedName.replace(".png", ".svg")}`,
    "/imagens/figura.png",
  ]) {
    const response = await anonAdmin.request(path);
    traversalOk &&= response.status === 404 && !response.body.includes("DATABASE_URL");
  }
  check("rota de imagens recusa path traversal e nomes fora do padrão", traversalOk);
  for (let index = 0; index < 9; index += 1) {
    await upload(admin, editDraft.id, { ...goodPng, bytes: makePng(8, 8, index + 1) });
  }
  reply = await upload(admin, editDraft.id, goodPng);
  check(
    "limite de 10 imagens por enunciado",
    reply.location.includes("erro=limite") && (await assetsOf(editDraft.id)).length === 10,
    reply.location,
  );
  const beforeRemove = await assetsOf(editDraft.id);
  const removeFields = await formFields(admin, editPath, ">Remover</button>");
  await postFields(answerer, editPath, removeFields);
  check(
    "aluno reaproveitando o “Remover” do admin não apaga nada",
    Object.keys(removeFields).some((key) => key.startsWith("$ACTION")) &&
      (await assetsOf(editDraft.id)).length === 10,
    Object.keys(removeFields).join(","),
  );
  await postFields(admin, editPath, removeFields);
  const afterRemove = await assetsOf(editDraft.id);
  const removedName = beforeRemove[0].filePath.replace("uploads/", "");
  check(
    "admin remove: some do banco e do disco, e as posições se reorganizam",
    afterRemove.length === 9 &&
      !afterRemove.some((asset) => asset.id === beforeRemove[0].id) &&
      !uploadFiles().includes(removedName) &&
      afterRemove.map((asset) => asset.position).join(",") === "0,1,2,3,4,5,6,7,8",
  );
  const moveFields = await formFields(admin, editPath, 'name="direcao" value="down"');
  await postFields(admin, editPath, moveFields);
  const afterMove = await assetsOf(editDraft.id);
  check(
    "mover para baixo troca a ordem das duas primeiras imagens",
    afterMove[0].id === afterRemove[1].id && afterMove[1].id === afterRemove[0].id,
  );
  const captionFields = await formFields(admin, editPath, 'name="legenda" value=');
  await postFields(admin, editPath, {
    ...captionFields,
    legenda: '<img src=x onerror="alert(3)"> legenda',
  });
  const captionPage = await admin.get(editPath);
  check(
    "legenda com HTML fica escapada",
    !captionPage.body.includes('<img src=x onerror="alert(3)">') &&
      captionPage.body.includes("&lt;img src=x onerror="),
  );

  group("Publicar e despublicar");
  const publishedAt = async (id: string) =>
    (await prisma.question.findUniqueOrThrow({ where: { id }, select: { publishedAt: true } }))
      .publishedAt;
  const publishFields = await formFields(admin, editPath, 'name="acao" value="publicar"');
  await postFields(answerer, editPath, publishFields);
  await postFields(anonAdmin, editPath, publishFields);
  check(
    "aluno e visitante reaproveitando o “Publicar” do admin não publicam",
    Object.keys(publishFields).some((key) => key.startsWith("$ACTION")) &&
      (await publishedAt(editDraft.id)) === null,
  );
  const incomplete = await prisma.question.create({
    data: {
      examId: exam2017.id,
      originalLabel: `${DRAFT_LABEL}-G`,
      order: 994,
      type: "OBJECTIVE",
      area: "COMPONENTE_ESPECIFICO",
      statementMd: "Incompleta\n\n(ver imagem anexa: figura que não existe)",
      options: {
        create: ["A", "B", "C", "D", "E"].map((letter) => ({
          letter,
          textMd: letter === "D" ? "" : `alt ${letter}`,
          isCorrect: false,
        })),
      },
      tags: { create: { topicId: soTopic.id } },
    },
    select: { id: true },
  });
  const incompletePath = `/admin/questoes/${incomplete.id}`;
  const incompletePage = pageText((await admin.get(incompletePath)).body);
  reply = await postFields(admin, incompletePath, {
    ...(await formFields(admin, incompletePath, 'name="acao" value="publicar"')),
  });
  check(
    "questão incompleta não publica e o painel lista as pendências",
    (await publishedAt(incomplete.id)) === null &&
      incompletePage.includes("Há alternativa sem texto.") &&
      incompletePage.includes("Nenhuma alternativa marcada como correta.") &&
      incompletePage.includes("O texto tem 1 marcador de imagem e só 0 imagens anexadas."),
  );
  reply = await postFields(admin, editPath, publishFields);
  const studentSees = await answerer.get(`/questoes/${editDraft.id}`);
  check(
    "admin publica: aluno passa a ver a questão",
    (await publishedAt(editDraft.id)) !== null && studentSees.status === 200,
    `${studentSees.status}`,
  );
  await prisma.attemptItem.deleteMany({
    where: { attempt: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" } },
  });
  await prisma.attempt.deleteMany({
    where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
  });
  await buildMulti([
    ["tema", "Sistemas Operacionais"],
    ["quantidade", "40"],
  ]);
  const withEdited = await prisma.attempt.findFirstOrThrow({
    where: { user: { email: studentEmail }, mode: "CUSTOM", status: "IN_PROGRESS" },
    select: { id: true, questionIds: true },
  });
  const editedPosition = withEdited.questionIds.indexOf(editDraft.id) + 1;
  const unpublishFields = await formFields(admin, editPath, 'name="acao" value="despublicar"');
  await postFields(admin, editPath, unpublishFields);
  const stillPublished = (await publishedAt(editDraft.id)) !== null;
  const adminWarning = pageText((await admin.get(editPath)).body);
  await postFields(admin, editPath, { ...unpublishFields, confirmacao: "sim" });
  const hiddenAgain = await answerer.get(`/questoes/${editDraft.id}`);
  const inSimulado = await answerer.get(`/simulados/${withEdited.id}?q=${editedPosition}`);
  check(
    "despublicar exige confirmação; depois o aluno não vê mais, mas o simulado já começado continua",
    editedPosition > 0 &&
      stillPublished &&
      adminWarning.includes("1 simulado em andamento inclui esta questão") &&
      (await publishedAt(editDraft.id)) === null &&
      hiddenAgain.status === 404 &&
      inSimulado.status === 200 &&
      pageText(inSimulado.body).includes("<script>alert(1)</script>"),
    `${editedPosition} ${stillPublished} ${hiddenAgain.status} ${inSimulado.status}`,
  );
  const bulkPath = `/admin/provas/${exam2017.id}`;
  const bulkFields = await formFields(admin, bulkPath, 'name="examId"');
  const postBulk = (client: Client, entries: [string, string][]) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(bulkFields)) data.append(key, value);
    for (const [key, value] of entries) data.append(key, value);
    return client.request(bulkPath, { method: "POST", body: data }, { origin: BASE });
  };
  const exam2021Question = await prisma.question.findFirstOrThrow({
    where: { examId: { not: exam2017.id } },
    select: { id: true, publishedAt: true },
  });
  await postBulk(answerer, [
    ["acao", "publicar"],
    ["ids", editDraft.id],
  ]);
  const foreignBulk = await postBulk(admin, [
    ["acao", "despublicar"],
    ["confirmacao", "sim"],
    ["ids", exam2021Question.id],
  ]);
  const tooMany = await postBulk(admin, [
    ["acao", "publicar"],
    ...Array.from({ length: 101 }, (_, index): [string, string] => [
      "ids",
      `a${String(index).padStart(12, "0")}`,
    ]),
  ]);
  check(
    "lote: aluno não publica, questão de outra prova e mais de 100 ids são recusados",
    (await publishedAt(editDraft.id)) === null &&
      (await publishedAt(exam2021Question.id))?.getTime() ===
        exam2021Question.publishedAt?.getTime() &&
      pageText(foreignBulk.body).includes("não pertence a esta prova") &&
      pageText(tooMany.body).includes("Pedido inválido"),
  );
  reply = await postBulk(admin, [
    ["acao", "publicar"],
    ["ids", editDraft.id],
    ["ids", incomplete.id],
  ]);
  const bulkText = pageText(reply.body);
  check(
    "lote publica as completas e pula as com pendência, dizendo o motivo",
    (await publishedAt(editDraft.id)) !== null &&
      (await publishedAt(incomplete.id)) === null &&
      bulkText.includes("1 publicada") &&
      bulkText.includes("1 com pendência") &&
      bulkText.includes(`${DRAFT_LABEL}-G: Ainda não foi revisada`) &&
      bulkText.includes("Há alternativa sem texto."),
    bulkText.slice(bulkText.indexOf("publicada") - 20, bulkText.indexOf("publicada") + 160),
  );
  await postBulk(admin, [
    ["acao", "despublicar"],
    ["ids", editDraft.id],
  ]);
  check(
    "lote de despublicar sem confirmação não faz nada",
    (await publishedAt(editDraft.id)) !== null,
  );

  group("Cadastro de prova nova");
  const importPath = "/admin/provas/nova";
  const importProva = [
    "QUESTÃO DISCURSIVA 1",
    "Explique o conceito de teste. (valor: 10,0 pontos)",
    "QUESTÃO 1",
    "Enunciado da primeira <script>alert(9)</script>",
    "A um",
    "B dois",
    "C três",
    "D quatro",
    "E cinco",
    "QUESTÃO 2",
    "Enunciado da segunda",
    "A x",
    "B y",
    "C z",
    "D w",
    "E k",
  ].join("\n");
  const importGabarito = "QUESTÃO 1 B\nQUESTÃO 2 ANULADA";
  const testExamsOf = () =>
    prisma.exam.findMany({
      where: { course: TEST_COURSE },
      select: {
        id: true,
        year: true,
        questions: { select: { id: true, originalLabel: true, publishedAt: true, status: true } },
      },
    });
  const blockedImport = await Promise.all([answerer.get(importPath), anonAdmin.get(importPath)]);
  check(
    "aluno e visitante recebem 404 no cadastro de prova",
    blockedImport.every((response) => response.status === 404),
  );
  const importFields = await formFields(admin, importPath, 'name="etapa"');
  const postImport = (client: Client, fields: Record<string, string>) =>
    postFields(client, importPath, {
      ...importFields,
      ano: "2099",
      curso: TEST_COURSE,
      prova: importProva,
      gabarito: importGabarito,
      padrao: "",
      ...fields,
    });
  await postImport(answerer, { etapa: "criar" });
  await postImport(anonAdmin, { etapa: "criar" });
  check(
    "aluno e visitante reaproveitando o formulário não criam prova",
    Object.keys(importFields).some((key) => key.startsWith("$ACTION")) &&
      (await testExamsOf()).length === 0,
  );
  const badImports: [string, Record<string, string>][] = [
    ["ano inválido", { etapa: "criar", ano: "abc" }],
    ["ano absurdo", { etapa: "criar", ano: "1500" }],
    ["prova vazia", { etapa: "criar", prova: "   " }],
    ["texto gigante", { etapa: "criar", prova: "x".repeat(300_001) }],
    ["sem cabeçalhos", { etapa: "criar", prova: "texto solto sem questões" }],
    ["etapa forjada", { etapa: "apagar-tudo" }],
    ["curso vazio", { etapa: "criar", curso: "" }],
  ];
  for (const [, fields] of badImports) {
    await postImport(admin, fields);
  }
  check("7 envios inválidos no cadastro não criam nada", (await testExamsOf()).length === 0);
  reply = await postImport(admin, { etapa: "analisar" });
  const previewText = pageText(reply.body);
  check(
    "“Analisar” mostra a prévia sem gravar nada",
    previewText.includes("3 questões encontradas: 2 objetivas e 1 discursivas, 1 anuladas") &&
      previewText.includes("correta B") &&
      (await testExamsOf()).length === 0,
    previewText.slice(previewText.indexOf("Prévia"), previewText.indexOf("Prévia") + 200),
  );
  reply = await postImport(admin, { etapa: "criar" });
  const created = await testExamsOf();
  check(
    "“Criar” grava a prova com todas as questões em rascunho",
    created.length === 1 &&
      created[0].questions.length === 3 &&
      created[0].questions.every((question) => question.publishedAt === null) &&
      created[0].questions.find((question) => question.originalLabel === "2")?.status ===
        "ANULADA" &&
      reply.location.includes(`/admin/provas/${created[0].id}?importada=1`),
    reply.location,
  );
  const createdExam = created[0];
  const duplicate = await postImport(admin, { etapa: "criar" });
  check(
    "cadastrar a mesma prova de novo é recusado",
    (await testExamsOf()).length === 1 &&
      pageText(duplicate.body).includes("Já existe uma prova de 2099"),
  );
  const examAdminPage = await admin.get(`/admin/provas/${createdExam.id}`);
  const studentList = pageText((await answerer.get("/questoes?ano=2099&status=TODAS")).body);
  const studentSimulados = await answerer.get("/simulados");
  check(
    "prova nova em rascunho: HTML escapado no painel e invisível para o aluno",
    !examAdminPage.body.includes("<script>alert(9)") &&
      !examAdminPage.body.includes("<script alert(9)") &&
      examAdminPage.body.includes("&lt;script alert(9)") &&
      studentList.includes("Nenhuma questão encontrada") &&
      !studentSimulados.body.includes(createdExam.id),
  );
  const examPath = `/admin/provas/${createdExam.id}`;
  const deleteFields = await formFields(admin, examPath, ">Excluir prova</button>");
  await postFields(answerer, examPath, { ...deleteFields, confirmacao: "sim" });
  await postFields(admin, examPath, deleteFields);
  check(
    "excluir prova: aluno não consegue e admin precisa confirmar",
    Object.keys(deleteFields).some((key) => key.startsWith("$ACTION")) &&
      (await testExamsOf()).length === 1,
  );
  const firstImported = createdExam.questions.find((question) => question.originalLabel === "1")!;
  const firstImportedPath = `/admin/questoes/${firstImported.id}`;
  const importedPublishFields = await formFields(
    admin,
    firstImportedPath,
    'name="acao" value="publicar"',
  );
  reply = await postFields(admin, firstImportedPath, importedPublishFields);
  check(
    "questão importada não publica antes de revisada (salva no editor)",
    (await publishedAt(firstImported.id)) === null &&
      pageText(reply.body).includes("Ainda não foi revisada") &&
      pageText((await admin.get(examPath)).body).includes("Não revisada"),
  );
  const importedEditor = await formFields(admin, firstImportedPath, 'name="statementMd"');
  const importedData = new FormData();
  for (const [key, value] of Object.entries(importedEditor)) importedData.append(key, value);
  for (const [key, value] of [
    ["statementMd", "Enunciado da primeira, revisado"],
    ["area", "FORMACAO_GERAL"],
    ["status", "VALID"],
    ["valuePoints", ""],
    ["option_A", "um"],
    ["option_B", "dois"],
    ["option_C", "três"],
    ["option_D", "quatro"],
    ["option_E", "cinco"],
    ["correct", "B"],
    ["topic", "Formação Geral"],
  ]) {
    importedData.set(key, value);
  }
  await admin.request(firstImportedPath, { method: "POST", body: importedData }, { origin: BASE });
  await postFields(
    admin,
    firstImportedPath,
    await formFields(admin, firstImportedPath, 'name="acao" value="publicar"'),
  );
  reply = await postFields(admin, examPath, { ...deleteFields, confirmacao: "sim" });
  check(
    "prova com questão publicada não pode ser excluída",
    (await publishedAt(firstImported.id)) !== null &&
      (await testExamsOf()).length === 1 &&
      reply.location.includes("erro=exclusao"),
    reply.location,
  );
  await postFields(admin, firstImportedPath, {
    ...(await formFields(admin, firstImportedPath, 'name="acao" value="despublicar"')),
    confirmacao: "sim",
  });
  reply = await postFields(admin, examPath, { ...deleteFields, confirmacao: "sim" });
  check(
    "sem nada publicado, o admin exclui a prova e tudo dela",
    (await testExamsOf()).length === 0 &&
      (await prisma.question.count({ where: { examId: createdExam.id } })) === 0 &&
      reply.location.includes("/admin?excluida=1"),
    reply.location,
  );

  await prisma.attemptItem.deleteMany({
    where: { attempt: { user: { email: { endsWith: TEST_DOMAIN } } } },
  });
  await prisma.attempt.deleteMany({ where: { user: { email: { endsWith: TEST_DOMAIN } } } });

  group("Vazamento de informação");
  reply = await anon.get("/pagina-que-nao-existe");
  check("404 não expõe detalhes internos", reply.status === 404 && noLeak(reply.body));
  reply = await anon.request(
    "/login",
    {
      method: "POST",
      body: "lixo",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    },
    { origin: BASE },
  );
  check("POST malformado não expõe stack trace", noLeak(reply.body), `status ${reply.status}`);

  await cleanup();
  await prisma.$disconnect();

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} ataques contidos.`);
  if (failed.length > 0) {
    console.log(
      "Falharam:\n" + failed.map((f) => `- [${f.group}] ${f.name} ${f.detail}`).join("\n"),
    );
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
