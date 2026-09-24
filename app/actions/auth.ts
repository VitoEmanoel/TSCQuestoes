"use server";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import {
  anyLocked,
  clientIp,
  recordFailure,
  SIGNUP_EMAIL_POLICY,
  SIGNUP_IP_POLICY,
  throttleKey,
} from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import {
  createPendingSignup,
  findPendingSignup,
  MAX_CONFIRM_ATTEMPTS,
  sendAccountExistsEmail,
  sendConfirmationEmail,
} from "@/lib/signup";
import {
  type AuthFormState,
  normalizeEmail,
  safeRedirectPath,
  validateSignup,
} from "@/lib/auth-validation";

function describeAuthError(error: AuthError): string {
  if (error instanceof CredentialsSignin && error.code === "rate_limited") {
    return "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.";
  }
  return error.type === "CredentialsSignin"
    ? "E-mail ou senha incorretos."
    : "Não foi possível entrar agora. Tente novamente.";
}

async function portalLogin(
  portal: "aluno" | "admin",
  formData: FormData,
  redirectTo: string,
): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = formData.get("password");

  if (!email || typeof password !== "string" || password.length === 0) {
    return { message: "Informe e-mail e senha.", values: { email } };
  }

  try {
    await signIn("credentials", { email, password, portal, redirectTo });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: describeAuthError(error), values: { email } };
    }
    throw error;
  }

  return {};
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return portalLogin("aluno", formData, safeRedirectPath(formData.get("callbackUrl")));
}

export async function adminLogin(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  return portalLogin("admin", formData, "/admin");
}

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const result = validateSignup(formData);
  if (!result.ok) {
    return result.state;
  }

  const { name, email, password } = result.data;
  const ipKey = throttleKey("signup-ip", clientIp(await headers()));
  if (await anyLocked([ipKey])) {
    return {
      message: "Muitas solicitações de cadastro a partir desta rede. Tente novamente mais tarde.",
      values: { name, email },
    };
  }

  const emailKey = throttleKey("signup-email", email);
  const passwordHash = await bcrypt.hash(password, 10);
  const emailLimited = await anyLocked([emailKey]);
  await recordFailure(ipKey, SIGNUP_IP_POLICY);

  if (!emailLimited) {
    await recordFailure(emailKey, SIGNUP_EMAIL_POLICY);
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    try {
      if (existing) {
        await sendAccountExistsEmail(email);
      } else {
        const token = await createPendingSignup({ name, email, passwordHash });
        await sendConfirmationEmail(email, name, token);
      }
    } catch {
      return {
        message: "Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.",
        values: { name, email },
      };
    }
  }

  return { sentTo: email };
}

export async function confirmSignup(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = formData.get("token");
  const password = formData.get("password");
  if (typeof token !== "string" || typeof password !== "string" || password.length === 0) {
    return { message: "Informe a senha escolhida no cadastro." };
  }

  const pending = await findPendingSignup(token);
  if (!pending) {
    return { message: "Este link é inválido ou expirou. Faça o cadastro novamente." };
  }

  if (!(await bcrypt.compare(password, pending.passwordHash))) {
    const updated = await prisma.pendingSignup.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return {
      message:
        updated.attempts >= MAX_CONFIRM_ATTEMPTS
          ? "Este link foi bloqueado por excesso de tentativas. Faça o cadastro novamente."
          : "A senha não confere com a escolhida no cadastro.",
    };
  }

  try {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          name: pending.name,
          email: pending.email,
          passwordHash: pending.passwordHash,
          role: "STUDENT",
        },
      }),
      prisma.pendingSignup.deleteMany({ where: { email: pending.email } }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await prisma.pendingSignup.deleteMany({ where: { email: pending.email } });
      return { message: "Este e-mail já tem uma conta ativa. Faça login." };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email: pending.email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Conta ativada. Faça login para continuar." };
    }
    throw error;
  }

  return {};
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
