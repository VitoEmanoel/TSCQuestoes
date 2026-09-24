type Env = Record<string, string | undefined>;

export function googleConfigured(env: Env = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

export function studentPasswordEnabled(env: Env = process.env): boolean {
  return env.STUDENT_PASSWORD_AUTH !== "off" || !googleConfigured(env);
}

export const PASSWORD_DISABLED_MESSAGE =
  "O acesso de estudantes é só pela conta Google institucional. Use “Continuar com Google”.";
