import { Prisma } from "@prisma/client";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { googleConfigured, studentPasswordEnabled } from "@/lib/auth-mode";
import { normalizeEmail } from "@/lib/auth-validation";
import {
  anyLocked,
  clearThrottle,
  clientIp,
  EMAIL_POLICY,
  IP_POLICY,
  isLocked,
  recordFailure,
  throttleKey,
} from "@/lib/login-throttle";
import { allowedSignupDomains, googleIdentityAllowed } from "@/lib/institutional-email";
import { prisma } from "@/lib/prisma";

export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

const DUMMY_HASH = bcrypt.hashSync("senha-inexistente-para-tempo-constante", 10);

export const googleEnabled = googleConfigured();

const GOOGLE_DENIED = "/login?erro=google";

async function ensureGoogleStudent(email: string, name: string | null): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  if (existing) {
    return existing.role === "STUDENT";
  }
  try {
    await prisma.user.create({ data: { email, name, role: "STUDENT" } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
  }
  const created = await prisma.user.findUnique({ where: { email }, select: { role: true } });
  return created?.role === "STUDENT";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    ...(googleEnabled
      ? [
          Google({
            checks: ["pkce", "state", "nonce"],
            authorization: {
              params: {
                prompt: "select_account",
                ...(allowedSignupDomains().length === 1 ? { hd: allowedSignupDomains()[0] } : {}),
              },
            },
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: {},
        password: {},
        portal: {},
      },
      authorize: async (credentials, request) => {
        const email = normalizeEmail((credentials?.email as string | undefined) ?? null);
        const password = credentials?.password;
        const expectedRole = credentials?.portal === "admin" ? "ADMIN" : "STUDENT";

        if (!email || typeof password !== "string" || password.length === 0) {
          return null;
        }
        if (expectedRole === "STUDENT" && !studentPasswordEnabled()) {
          return null;
        }

        const emailKey = throttleKey("email", email);
        const ipKey = throttleKey("ip", clientIp(request.headers));

        if (await anyLocked([emailKey, ipKey])) {
          throw new TooManyAttempts();
        }

        const user = await prisma.user.findUnique({ where: { email } });
        const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

        if (!user?.passwordHash || !passwordMatches || user.role !== expectedRole) {
          const [emailState, ipState] = await Promise.all([
            recordFailure(emailKey, EMAIL_POLICY),
            recordFailure(ipKey, IP_POLICY),
          ]);
          const now = new Date();
          if (isLocked(emailState, now) || isLocked(ipState, now)) {
            throw new TooManyAttempts();
          }
          return null;
        }

        await clearThrottle(emailKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    signIn: async ({ account, profile }) => {
      if (account?.provider !== "google") {
        return true;
      }
      const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : null;
      const allowed = googleIdentityAllowed(
        {
          email,
          emailVerified: profile?.email_verified === true,
          hostedDomain: typeof profile?.hd === "string" ? profile.hd : null,
        },
        allowedSignupDomains(),
      );
      if (!allowed || !email) {
        return GOOGLE_DENIED;
      }
      const name = typeof profile?.name === "string" ? profile.name.slice(0, 100) : null;
      return (await ensureGoogleStudent(email, name)) ? true : GOOGLE_DENIED;
    },
    jwt: async ({ token, user, account, profile }) => {
      if (account?.provider === "google") {
        const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : "";
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });
        if (!dbUser || dbUser.role !== "STUDENT") {
          return null;
        }
        token.sub = dbUser.id;
        token.role = dbUser.role;
        return token;
      }
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role;
      }
      return session;
    },
  },
});
