import "dotenv/config";
import { randomBytes } from "node:crypto";
import { encode } from "@auth/core/jwt";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.ATTACK_BASE_URL ?? "http://localhost:3123";
const MAILPIT = process.env.ATTACK_MAILPIT_URL ?? "http://localhost:8025/api/v1";
const SESSION_COOKIE = "authjs.session-token";
const TEST_DOMAIN = "@ataque.local";
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
    "token legítimo com role=ADMIN: a camada de dados relê o papel no banco e mostra Estudante",
    leakedHeader.includes("Estudante") && !leakedHeader.includes("Administrador"),
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
