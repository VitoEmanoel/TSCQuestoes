import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!transport) {
    const user = process.env.SMTP_USER;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? "" } : undefined,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  return transport;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function appUrl(path: string): string {
  const base = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  await getTransport().sendMail({
    from: process.env.MAIL_FROM ?? "TSCQuestões <nao-responda@tscquestoes.local>",
    ...message,
  });
}
