import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { appUrl, escapeHtml, sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export const SIGNUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CONFIRM_ATTEMPTS = 5;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPendingSignup(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.pendingSignup.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.pendingSignup.create({
    data: {
      ...input,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SIGNUP_TOKEN_TTL_MS),
    },
  });
  return token;
}

export async function findPendingSignup(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }
  const pending = await prisma.pendingSignup.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!pending || pending.expiresAt <= new Date() || pending.attempts >= MAX_CONFIRM_ATTEMPTS) {
    return null;
  }
  return pending;
}

export async function sendConfirmationEmail(to: string, name: string, token: string) {
  const link = appUrl(`/cadastro/confirmar?token=${encodeURIComponent(token)}`);
  await sendMail({
    to,
    subject: "Confirme seu cadastro no TSCQuestões",
    text: [
      `Olá, ${name}!`,
      "",
      "Para ativar sua conta no TSCQuestões, abra o link abaixo e confirme a senha que você escolheu no cadastro:",
      link,
      "",
      "O link vale por 24 horas e só pode ser usado uma vez.",
      "Se você não pediu este cadastro, ignore este e-mail: nenhuma conta será criada.",
    ].join("\n"),
    html: [
      `<p>Olá, ${escapeHtml(name)}!</p>`,
      "<p>Para ativar sua conta no TSCQuestões, abra o link abaixo e confirme a senha que você escolheu no cadastro:</p>",
      `<p><a href="${escapeHtml(link)}">Ativar minha conta</a></p>`,
      "<p>O link vale por 24 horas e só pode ser usado uma vez.</p>",
      "<p>Se você não pediu este cadastro, ignore este e-mail: nenhuma conta será criada.</p>",
    ].join(""),
  });
}

export async function sendAccountExistsEmail(to: string) {
  const loginLink = appUrl("/login");
  await sendMail({
    to,
    subject: "Tentativa de cadastro no TSCQuestões",
    text: [
      "Alguém tentou criar uma conta no TSCQuestões com este e-mail, mas você já tem uma conta.",
      "",
      `Se foi você, basta entrar: ${loginLink}`,
      "Se não foi você, pode ignorar este e-mail. Nada foi alterado na sua conta.",
    ].join("\n"),
    html: [
      "<p>Alguém tentou criar uma conta no TSCQuestões com este e-mail, mas você já tem uma conta.</p>",
      `<p>Se foi você, basta <a href="${escapeHtml(loginLink)}">entrar</a>.</p>`,
      "<p>Se não foi você, pode ignorar este e-mail. Nada foi alterado na sua conta.</p>",
    ].join(""),
  });
}
