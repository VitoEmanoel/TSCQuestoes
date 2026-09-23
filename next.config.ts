import type { NextConfig } from "next";
import { isHttps, staticSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: {
    "/*": [
      "ProvasEnadeADS/**",
      "scripts/**",
      "storage/**",
      "docs/**",
      ".git/**",
      "coverage/**",
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
