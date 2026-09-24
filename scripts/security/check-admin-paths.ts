import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN = ["app", "lib", "components", "auth.ts", "scripts", "prisma/seed.ts"];
const SEED = "prisma/seed.ts";
const STUDENT_ONLY_WRITERS = [
  "auth.ts",
  "scripts/security/browser-check.ts",
  "scripts/qa/mobile-check.ts",
];
const USER_WRITERS = new Set(["app/actions/auth.ts", SEED, ...STUDENT_ONLY_WRITERS]);

const RULES: { name: string; pattern: RegExp; allowed: Set<string> }[] = [
  {
    name: "atribuição de papel ADMIN",
    pattern: /role\s*[:=]\s*["'`]ADMIN["'`]|UserRole\.ADMIN/g,
    allowed: new Set([SEED, "scripts/security/attack-suite.ts"]),
  },
  {
    name: "chave app.allow_admin do trigger",
    pattern: /allow_admin/g,
    allowed: new Set([SEED, "scripts/security/check-admin-paths.ts"]),
  },
  {
    name: "escrita na tabela User pelo Prisma",
    pattern: /\b(?:prisma|tx)\.user\.(?:create|createMany|update|updateMany|upsert)\b/g,
    allowed: USER_WRITERS,
  },
  {
    name: "SQL manual envolvendo a tabela User",
    pattern: /\$(?:executeRaw|queryRaw)(?:Unsafe)?[^;]*"User"/g,
    allowed: new Set(),
  },
];

function listFiles(path: string): string[] {
  const absolute = join(ROOT, path);
  if (statSync(absolute).isFile()) {
    return [path];
  }
  return readdirSync(absolute).flatMap((entry) =>
    entry === "node_modules" || entry === "drafts" || entry === "raw"
      ? []
      : listFiles(join(path, entry)),
  );
}

function main() {
  const files = SCAN.flatMap(listFiles).filter((file) => /\.(ts|tsx)$/.test(file));
  const problems: string[] = [];

  for (const file of files) {
    const source = readFileSync(join(ROOT, file), "utf-8");
    for (const rule of RULES) {
      for (const match of source.matchAll(rule.pattern)) {
        if (!rule.allowed.has(file)) {
          const line = source.slice(0, match.index).split("\n").length;
          problems.push(`${file}:${line} — ${rule.name}: ${match[0]}`);
        }
      }
    }
  }

  const actions = readFileSync(join(ROOT, "app/actions/auth.ts"), "utf-8");
  const creates = [...actions.matchAll(/prisma\.user\.create\(\{[\s\S]*?\n\s{6}\}\),?/g)];
  for (const create of creates) {
    if (!/role:\s*"STUDENT"/.test(create[0])) {
      problems.push(`app/actions/auth.ts — criação de User sem role: "STUDENT" fixo`);
    }
  }
  for (const writer of STUDENT_ONLY_WRITERS) {
    const source = readFileSync(join(ROOT, writer), "utf-8");
    const starts = [...source.matchAll(/prisma\.user\.create\(/g)].map((match) => match.index ?? 0);
    if (
      starts.length === 0 ||
      starts.some((start) => !/role:\s*"STUDENT"/.test(source.slice(start, start + 400)))
    ) {
      problems.push(`${writer} — criação de User sem role: "STUDENT" fixo`);
    }
  }
  if (/formData\.get\(\s*["']role["']\s*\)/.test(actions)) {
    problems.push("app/actions/auth.ts — lê o campo role do formulário");
  }

  console.log(
    `${files.length} arquivos verificados, ${creates.length} criação(ões) de User conferida(s).`,
  );
  if (problems.length > 0) {
    console.error(problems.map((problem) => `ERRO ${problem}`).join("\n"));
    process.exit(1);
  }
  console.log("OK: nenhum caminho da aplicação cria ou promove ADMIN.");
}

main();
