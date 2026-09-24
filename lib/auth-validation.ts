export type AuthFormState = {
  message?: string;
  errors?: Partial<Record<"name" | "email" | "password" | "confirmPassword", string>>;
  values?: { name?: string; email?: string };
  sentTo?: string;
};

export type SignupInput = {
  name: string;
  email: string;
  password: string;
};

import { describeDomains, isAllowedEmail } from "@/lib/institutional-email";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;

export function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export function validateSignup(
  formData: FormData,
  allowedDomains: string[] = [],
): { ok: true; data: SignupInput } | { ok: false; state: AuthFormState } {
  const name = readText(formData.get("name")).trim().replace(/\s+/g, " ");
  const email = normalizeEmail(formData.get("email"));
  const password = readText(formData.get("password"));
  const confirmPassword = readText(formData.get("confirmPassword"));
  const errors: AuthFormState["errors"] = {};

  if (name.length < 2) {
    errors.name = "Informe seu nome (pelo menos 2 caracteres).";
  } else if (name.length > 100) {
    errors.name = "O nome pode ter no máximo 100 caracteres.";
  }

  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Informe um e-mail válido.";
  } else if (!isAllowedEmail(email, allowedDomains)) {
    errors.email = `Use seu e-mail institucional (${describeDomains(allowedDomains)}).`;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = "A senha precisa ter pelo menos uma letra e um número.";
  } else if (password.length > 72) {
    errors.password = "A senha pode ter no máximo 72 caracteres.";
  }

  if (confirmPassword !== password) {
    errors.confirmPassword = "As senhas não conferem.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, state: { errors, values: { name, email } } };
  }

  return { ok: true, data: { name, email, password } };
}

export function safeRedirectPath(value: FormDataEntryValue | string | null | undefined): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }
  if (value.startsWith("/login") || value.startsWith("/cadastro")) {
    return "/";
  }
  return value;
}
