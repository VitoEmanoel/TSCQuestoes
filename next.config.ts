import type { NextConfig } from "next";
import { isHttps, staticSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  deploymentId: process.env.DEPLOYMENT_VERSION || undefined,
  poweredByHeader: false,
  experimental: {
    isrFlushToDisk: false,
  },
  outputFileTracingIncludes: {
    "/*": ["node_modules/@prisma/client/**", "node_modules/.prisma/client/**"],
  },
  outputFileTracingExcludes: {
    "/*": [
      "ProvasEnadeADS/**",
      "scripts/**",
      "storage/**",
      "docs/**",
      ".git/**",
      "coverage/**",
      "release/**",
      "app/**",
      "components/**",
      "lib/**",
      "types/**",
      "deploy/**",
      "prisma/**",
      "public/**",
      "*.md",
      "*.ts",
      "*.mjs",
      "*.yml",
      "tsconfig*.json",
      "tsconfig.tsbuildinfo",
      "package-lock.json",
      ".claudeignore",
      ".gitignore",
      ".prettier*",
      ".env*",
    ],
  },
  turbopack: {
    ignoreIssue: [{ path: "**/lib/uploads.ts", title: /Dynamic filesystem access/ }],
  },
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders(isHttps()) }];
  },
};

export default nextConfig;
