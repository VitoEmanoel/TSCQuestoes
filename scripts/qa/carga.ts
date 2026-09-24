import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.CARGA_URL ?? "http://localhost:3123";
const USERS = Number(process.env.CARGA_USUARIOS ?? 40);
const SECONDS = Number(process.env.CARGA_SEGUNDOS ?? 30);
const EMAIL = process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local";
const PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? "admin123";

function cookiesFrom(response: Response, jar: Map<string, string>) {
  for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function header(jar: Map<string, string>): string {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function login(): Promise<string> {
  const jar = new Map<string, string>();
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  cookiesFrom(csrf, jar);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const response = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: header(jar) },
    body: new URLSearchParams({ email: EMAIL, password: PASSWORD, portal: "admin", csrfToken }),
  });
  cookiesFrom(response, jar);
  if (![...jar.keys()].some((key) => key.includes("session-token"))) {
    throw new Error("Não consegui entrar com a conta de administrador.");
  }
  return header(jar);
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function main() {
  const prisma = new PrismaClient();
  const questions = await prisma.question.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true },
  });
  await prisma.$disconnect();
  const cookie = await login();
  const paths = [
    "/",
    "/questoes",
    "/questoes?ano=2021&ano=2017",
    "/historico",
    "/simulados",
    ...questions.slice(0, 60).map((question) => `/questoes/${question.id}`),
  ];

  const times: number[] = [];
  const failures = new Map<string, number>();
  const deadline = Date.now() + SECONDS * 1000;

  const worker = async () => {
    while (Date.now() < deadline) {
      const path = paths[Math.floor(Math.random() * paths.length)];
      const started = performance.now();
      try {
        const response = await fetch(`${BASE}${path}`, {
          headers: { cookie },
          redirect: "manual",
        });
        await response.arrayBuffer();
        if (response.status !== 200) {
          failures.set(`${response.status}`, (failures.get(`${response.status}`) ?? 0) + 1);
        }
      } catch (error) {
        const key = error instanceof Error ? error.message : "erro";
        failures.set(key, (failures.get(key) ?? 0) + 1);
      }
      times.push(performance.now() - started);
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 700));
    }
  };

  console.log(
    `${USERS} usuários simultâneos por ${SECONDS}s em ${BASE} (${paths.length} páginas)...`,
  );
  await Promise.all(Array.from({ length: USERS }, worker));

  times.sort((a, b) => a - b);
  const failed = [...failures.values()].reduce((sum, count) => sum + count, 0);
  console.log(`Requisições: ${times.length} (${(times.length / SECONDS).toFixed(1)}/s)`);
  console.log(
    `Tempo de resposta: mediana ${percentile(times, 50).toFixed(0)} ms · p95 ${percentile(times, 95).toFixed(0)} ms · p99 ${percentile(times, 99).toFixed(0)} ms · máx ${times.at(-1)?.toFixed(0)} ms`,
  );
  console.log(
    failed === 0
      ? "Falhas: 0"
      : `Falhas: ${failed} — ${[...failures].map(([key, count]) => `${key}×${count}`).join(", ")}`,
  );
  if (failed > 0 || percentile(times, 95) > 2000) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
