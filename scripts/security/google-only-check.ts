import "dotenv/config";
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const STUDENT_EMAIL = "so-google@ataque.local";
const STUDENT_PASSWORD = "senha-do-teste-so-google-123";
const FORGED_EMAIL = "forjado-so-google@ataque.local";
const DISABLED = "só pela conta Google institucional";

const prisma = new PrismaClient();
const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function actionId(name: string): string {
  const manifest = JSON.parse(
    readFileSync(join(".next", "server", "server-reference-manifest.json"), "utf-8"),
  ) as { node: Record<string, { exportedName?: string; filename?: string }> };
  const entry = Object.entries(manifest.node).find(
    ([, value]) => value.exportedName === name && value.filename === "app/actions/auth.ts",
  );
  if (!entry) {
    throw new Error(`Ação ${name} não encontrada no build.`);
  }
  return entry[0];
}

class Jar {
  cookies = new Map<string, string>();
  take(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const index = pair.indexOf("=");
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  header() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  }
  async session(): Promise<{ user?: { email?: string } } | null> {
    const response = await fetch(`${BASE}/api/auth/session`, {
      headers: { cookie: this.header() },
    });
    return (await response.json()) as { user?: { email?: string } } | null;
  }
}

async function apiLogin(email: string, password: string, portal?: string): Promise<Jar> {
  const jar = new Jar();
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  jar.take(csrf);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const body = new URLSearchParams({ email, password, csrfToken });
  if (portal) {
    body.set("portal", portal);
  }
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body,
  });
  jar.take(response);
  return jar;
}

async function forgeAction(path: string, id: string, fields: Record<string, string>) {
  const form = new FormData();
  form.set("$ACTION_REF_1", "");
  form.set("$ACTION_1:0", JSON.stringify({ id, bound: "$@1" }));
  form.set("$ACTION_1:1", JSON.stringify([{}]));
  form.set("$ACTION_KEY", "k0");
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value);
  }
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: BASE },
    body: form,
  });
  return { status: response.status, text: await response.text() };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${BASE}/login`)).ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("O servidor de teste não subiu.");
}

async function cleanup() {
  await prisma.pendingSignup.deleteMany({
    where: { email: { in: [FORGED_EMAIL, STUDENT_EMAIL] } },
  });
  await prisma.user.deleteMany({ where: { email: STUDENT_EMAIL, role: "STUDENT" } });
}

async function main() {
  let server: ChildProcess | null = null;
  try {
    await cleanup();
    await prisma.user.create({
      data: {
        email: STUDENT_EMAIL,
        name: "Aluno Só Google",
        role: "STUDENT",
        passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
      },
    });

    server = spawn("npx", ["next", "start", "-p", String(PORT)], {
      env: {
        ...process.env,
        AUTH_URL: BASE,
        STUDENT_PASSWORD_AUTH: "off",
        SIGNUP_ALLOWED_DOMAINS: "ataque.local",
        AUTH_GOOGLE_ID: "id-falso-dos-testes",
        AUTH_GOOGLE_SECRET: "segredo-falso-dos-testes",
      },
      stdio: "ignore",
      detached: true,
    });
    await waitForServer();

    const login = await (await fetch(`${BASE}/login`)).text();
    check(
      "/login mostra só o Google (sem campo de senha)",
      !login.includes('id="password"') &&
        !login.includes("ou com e-mail") &&
        login.includes("Continuar com Google") &&
        login.includes('href="/privacidade"'),
    );
    const signupPage = await (await fetch(`${BASE}/cadastro`)).text();
    check(
      "/cadastro mostra só o Google (sem formulário de senha)",
      !signupPage.includes('id="password"') && signupPage.includes("Criar conta com Google"),
    );
    const confirmPage = await fetch(`${BASE}/cadastro/confirmar?token=qualquer`, {
      redirect: "manual",
    });
    check(
      "/cadastro/confirmar manda de volta para /cadastro",
      confirmPage.status >= 300 &&
        confirmPage.status < 400 &&
        (confirmPage.headers.get("location") ?? "").includes("/cadastro"),
    );

    const student = await apiLogin(STUDENT_EMAIL, STUDENT_PASSWORD);
    check(
      "aluno com senha certa não entra pela API (sem portal)",
      (await student.session()) === null,
    );
    const studentPortal = await apiLogin(STUDENT_EMAIL, STUDENT_PASSWORD, "aluno");
    check(
      "aluno com senha certa não entra pela API (portal aluno)",
      (await studentPortal.session()) === null,
    );
    const studentAsAdmin = await apiLogin(STUDENT_EMAIL, STUDENT_PASSWORD, "admin");
    check("aluno pelo portal admin continua barrado", (await studentAsAdmin.session()) === null);

    const loginAction = await forgeAction("/login", actionId("login"), {
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD,
      callbackUrl: "/",
    });
    check(
      "ação de login forjada devolve o aviso e não cria sessão",
      loginAction.text.includes(DISABLED),
      `status ${loginAction.status}`,
    );

    const signupAction = await forgeAction("/cadastro", actionId("signup"), {
      name: "Forjado",
      email: FORGED_EMAIL,
      password: "senha-forjada-123456",
      confirmPassword: "senha-forjada-123456",
    });
    const pending = await prisma.pendingSignup.count({ where: { email: FORGED_EMAIL } });
    check(
      "cadastro por senha forjado é recusado e nada é gravado",
      signupAction.text.includes(DISABLED) && pending === 0,
      `status ${signupAction.status}, pendentes ${pending}`,
    );

    const confirmAction = await forgeAction("/cadastro/confirmar", actionId("confirmSignup"), {
      token: "token-inventado",
      password: "qualquer",
    });
    check(
      "confirmação de cadastro forjada é recusada",
      confirmAction.text.includes(DISABLED) || confirmAction.status >= 300,
      `status ${confirmAction.status}`,
    );

    const admin = await apiLogin(
      process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local",
      process.env.ADMIN_SEED_PASSWORD ?? "admin123",
      "admin",
    );
    check(
      "controle: o admin continua entrando por senha",
      (await admin.session())?.user?.email ===
        (process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local"),
    );
  } finally {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
    }
    await cleanup();
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} verificações do modo só Google.`,
  );
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
