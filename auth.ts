import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
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
import { prisma } from "@/lib/prisma";

export class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

const DUMMY_HASH = bcrypt.hashSync("senha-inexistente-para-tempo-constante", 10);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
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
    jwt: async ({ token, user }) => {
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
