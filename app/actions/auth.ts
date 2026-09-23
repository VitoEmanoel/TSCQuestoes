"use server";

import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  type AuthFormState,
  normalizeEmail,
  safeRedirectPath,
  validateSignup,
} from "@/lib/auth-validation";

function describeAuthError(error: AuthError): string {
  return error.type === "CredentialsSignin"
    ? "E-mail ou senha incorretos."
    : "Não foi possível entrar agora. Tente novamente.";
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get("email"));
  const password = formData.get("password");

  if (!email || typeof password !== "string" || password.length === 0) {
    return { message: "Informe e-mail e senha.", values: { email } };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeRedirectPath(formData.get("callbackUrl")),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: describeAuthError(error), values: { email } };
    }
    throw error;
  }

  return {};
}

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const result = validateSignup(formData);
  if (!result.ok) {
    return result.state;
  }

  const { name, email, password } = result.data;
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return {
      errors: { email: "Já existe uma conta com este e-mail." },
      values: { name, email },
    };
  }

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "STUDENT",
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        errors: { email: "Já existe uma conta com este e-mail." },
        values: { name, email },
      };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { message: "Conta criada, mas não foi possível entrar. Faça login." };
    }
    throw error;
  }

  return {};
}

export async function logout() {
  await signOut({ redirectTo: "/" });
}
