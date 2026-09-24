const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function parseAllowedDomains(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
        .filter((domain) => DOMAIN_PATTERN.test(domain)),
    ),
  ];
}

export function allowedSignupDomains(): string[] {
  return parseAllowedDomains(process.env.SIGNUP_ALLOWED_DOMAINS);
}

export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || normalized.indexOf("@") !== at) {
    return null;
  }
  const domain = normalized.slice(at + 1);
  return DOMAIN_PATTERN.test(domain) ? domain : null;
}

export function isAllowedEmail(email: string, domains: string[]): boolean {
  if (domains.length === 0) {
    return true;
  }
  const domain = emailDomain(email);
  return domain !== null && domains.includes(domain);
}

export function describeDomains(domains: string[]): string {
  return domains.map((domain) => `@${domain}`).join(" ou ");
}

export type GoogleIdentity = {
  email?: string | null;
  emailVerified?: boolean | null;
  hostedDomain?: string | null;
};

export function googleIdentityAllowed(identity: GoogleIdentity, domains: string[]): boolean {
  if (!identity.email || identity.emailVerified !== true || !emailDomain(identity.email)) {
    return false;
  }
  if (domains.length === 0) {
    return true;
  }
  const hostedDomain = identity.hostedDomain?.toLowerCase() ?? "";
  return isAllowedEmail(identity.email, domains) && domains.includes(hostedDomain);
}
