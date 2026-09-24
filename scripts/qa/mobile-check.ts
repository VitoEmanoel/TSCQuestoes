import "dotenv/config";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { findChrome, openPage, type Page, sleep } from "../security/cdp";

const BASE = process.env.ATTACK_BASE_URL ?? "http://localhost:3123";
const DEBUG_PORT = 9334;
const STUDENT_EMAIL = "celular@ataque.local";
const STUDENT_PASSWORD = "senhaCelular1";
const OUT_DIR = process.env.QA_SCREENSHOTS ?? join(tmpdir(), "tscq-celular");
const MIN_TARGET = 24;
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 740 },
];

const prisma = new PrismaClient();

type Measure = {
  overflow: number;
  offenders: string[];
  smallTargets: string[];
};

type Report = { page: string; viewport: string; measure: Measure; screenshot: string };

const MEASURE = `(() => {
  const vw = window.innerWidth;
  const describe = (element) => {
    const text = (element.innerText || element.getAttribute('aria-label') || element.value || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
    const classes = (element.getAttribute('class') || '').split(' ').slice(0, 3).join('.');
    return element.tagName.toLowerCase() + (classes ? '.' + classes : '') + (text ? ' "' + text + '"' : '');
  };
  const scrollsAlone = (element) => {
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden') return true;
    }
    return false;
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const offenders = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (!visible(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.right > vw + 1 && !scrollsAlone(element)) offenders.push(describe(element));
  }
  const smallTargets = [];
  for (const element of document.querySelectorAll('button, select, input:not([type=hidden]), textarea, a[href]')) {
    if (element.classList.contains('sr-only')) {
      const label = element.closest('label');
      if (!label) continue;
      const rect = label.getBoundingClientRect();
      if (rect.width < ${MIN_TARGET} || rect.height < ${MIN_TARGET}) smallTargets.push(describe(label));
      continue;
    }
    if (!visible(element)) continue;
    if (element.tagName === 'A' && element.closest('p, li p, figcaption') && getComputedStyle(element).display === 'inline') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < ${MIN_TARGET} || rect.height < ${MIN_TARGET}) smallTargets.push(describe(element));
  }
  return {
    overflow: Math.max(0, document.documentElement.scrollWidth - vw),
    offenders: [...new Set(offenders)].slice(0, 6),
    smallTargets: [...new Set(smallTargets)].slice(0, 8),
  };
})()`;

async function capture(page: Page, file: string) {
  const result = (await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  })) as { data: string };
  writeFileSync(file, Buffer.from(result.data, "base64"));
}

async function hydrated(page: Page) {
  await page.waitFor(
    "[...document.querySelectorAll('button, input, textarea, select')].every((el) => Object.keys(el).some((key) => key.startsWith('__react'))) || document.readyState === 'complete'",
    5_000,
  );
}

async function login(page: Page, email: string, password: string) {
  await page.evaluate(
    "[...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Sair'))?.click()",
  );
  await page.waitFor("!document.querySelector('header')?.textContent.includes('Sair')", 10_000);
  await page.goto(`${BASE}/login`);
  await page.evaluate(`(() => {
    document.querySelector('#email').value = ${JSON.stringify(email)};
    document.querySelector('#password').value = ${JSON.stringify(password)};
    document.querySelector('main form').requestSubmit();
  })()`);
  return page.waitFor("document.querySelector('header')?.textContent.includes('Sair')", 15_000);
}

async function removeStudent() {
  await prisma.attemptItem.deleteMany({ where: { attempt: { user: { email: STUDENT_EMAIL } } } });
  await prisma.attempt.deleteMany({ where: { user: { email: STUDENT_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: STUDENT_EMAIL } });
}

async function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  await removeStudent();
  await prisma.user.create({
    data: {
      email: STUDENT_EMAIL,
      name: "Aluno do Celular",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
    },
  });
  const profile = mkdtempSync(join(tmpdir(), "tscq-celular-chrome-"));
  const chrome: ChildProcess = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
    ],
    { stdio: "ignore" },
  );
  const reports: Report[] = [];
  try {
    const page = await openPage(DEBUG_PORT);
    await page.send("Page.enable");
    await page.send("Runtime.enable");

    const exam2017 = await prisma.exam.findFirstOrThrow({ where: { year: 2017 } });
    const exam2021 = await prisma.exam.findFirstOrThrow({ where: { year: 2021 } });
    const withImage = await prisma.question.findFirstOrThrow({
      where: { publishedAt: { not: null }, type: "OBJECTIVE", assets: { some: {} } },
      select: { id: true },
    });
    const withTable = await prisma.question.findFirstOrThrow({
      where: { publishedAt: { not: null }, statementMd: { contains: "\n|" } },
      select: { id: true },
    });
    const withCode = await prisma.question.findFirstOrThrow({
      where: { publishedAt: { not: null }, statementMd: { contains: "```" } },
      select: { id: true },
    });
    const discursive = await prisma.question.findFirstOrThrow({
      where: { examId: exam2017.id, originalLabel: "D4" },
      select: { id: true },
    });

    for (const viewport of VIEWPORTS) {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });

      const visit = async (name: string, path: string | null, prepare?: () => Promise<void>) => {
        if (path) await page.goto(`${BASE}${path}`, 1200);
        if (prepare) await prepare();
        await hydrated(page);
        await sleep(300);
        const measure = await page.evaluate<Measure>(MEASURE);
        const screenshot = join(OUT_DIR, `${viewport.name}-${name}.png`);
        await capture(page, screenshot);
        reports.push({ page: name, viewport: viewport.name, measure, screenshot });
      };

      await page.goto(`${BASE}/`, 800);
      await page.evaluate(
        "[...document.querySelectorAll('header button')].find((b) => b.textContent.includes('Sair'))?.click()",
      );
      await sleep(800);
      await visit("inicio", "/");
      await visit("login", "/login");
      await visit("cadastro", "/cadastro");

      await login(page, STUDENT_EMAIL, STUDENT_PASSWORD);
      await visit("questoes-lista", "/questoes");
      await visit("questao-imagem", `/questoes/${withImage.id}`);
      await visit("questao-tabela", `/questoes/${withTable.id}`);
      await visit("questao-codigo", `/questoes/${withCode.id}`);
      await visit("questao-respondida", null, async () => {
        await page.goto(`${BASE}/questoes/${withImage.id}`, 1200);
        await page.evaluate(`(() => {
          document.querySelector('input[name=letter]').closest('label').click();
          [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Responder').click();
        })()`);
        await page.waitFor("document.body.textContent.includes('Responder de novo')", 10_000);
      });
      await visit("discursiva", `/questoes/${discursive.id}?nova=1`);
      await visit("simulados", "/simulados");
      await visit("simulado-questao", null, async () => {
        await page.goto(`${BASE}/simulados`, 1200);
        await page.evaluate(`(() => {
          const form = document.querySelector('select[name=quantidade]').form;
          const choose = (name, value) => {
            const select = form.querySelector('select[name=' + name + ']');
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
          };
          choose('quantidade', '5');
          choose('tempo', '30');
          [...form.querySelectorAll('button')].find((b) => b.textContent.includes('Montar simulado')).click();
        })()`);
        await page.waitFor("/^\\/simulados\\/[^/]+$/.test(location.pathname)", 15_000);
        await sleep(800);
      });
      const simuladoPath = await page.evaluate<string>("location.pathname");
      await visit("simulado-replay", null, async () => {
        await page.goto(`${BASE}/simulados`, 1200);
        await page.evaluate(
          `document.querySelector('input[name=examId][value="${exam2021.id}"]').form.querySelector('button').click()`,
        );
        await page.waitFor("/^\\/simulados\\/[^/]+$/.test(location.pathname)", 15_000);
        await sleep(800);
      });
      await visit("simulado-entregar", `${simuladoPath}/entregar`);
      await visit("simulado-resultado", null, async () => {
        await page.evaluate(
          "[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Entregar e ver a nota')).click()",
        );
        await page.waitFor("location.pathname.endsWith('/resultado')", 15_000);
        await sleep(800);
      });
      await visit("simulado-revisao", `${simuladoPath}/revisao?q=1`);
      await visit("historico", "/historico");

      await login(
        page,
        process.env.ADMIN_SEED_EMAIL ?? "admin@tscquestoes.local",
        process.env.ADMIN_SEED_PASSWORD ?? "admin123",
      );
      await visit("admin", "/admin");
      await visit("admin-prova", `/admin/provas/${exam2021.id}`);
      await visit("admin-editor", `/admin/questoes/${withImage.id}`);
      await visit("admin-editor-discursiva", `/admin/questoes/${discursive.id}`);
      await visit("admin-nova-prova", "/admin/provas/nova");
      await removeStudent();
      await prisma.user.create({
        data: {
          email: STUDENT_EMAIL,
          name: "Aluno do Celular",
          role: "STUDENT",
          passwordHash: await bcrypt.hash(STUDENT_PASSWORD, 10),
        },
      });
    }
  } finally {
    chrome.kill("SIGKILL");
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
    await removeStudent();
    await prisma.$disconnect();
  }

  let overflowPages = 0;
  for (const report of reports) {
    const { overflow, offenders, smallTargets } = report.measure;
    if (overflow > 0) overflowPages += 1;
    const status = overflow > 0 ? "ROLAGEM" : "ok     ";
    console.log(
      `${status} ${report.viewport}px ${report.page}${overflow > 0 ? ` (+${overflow}px)` : ""}${
        offenders.length ? `\n         vazando: ${offenders.join(" | ")}` : ""
      }${smallTargets.length ? `\n         alvos pequenos: ${smallTargets.join(" | ")}` : ""}`,
    );
  }
  console.log(`\nCapturas em ${OUT_DIR}`);
  console.log(
    `${reports.length - overflowPages}/${reports.length} telas sem rolagem horizontal no celular.`,
  );
  if (overflowPages > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await removeStudent().catch(() => undefined);
  process.exit(1);
});
