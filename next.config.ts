import type { NextConfig } from "next";
import { isHttps, staticSecurityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders(isHttps()) }];
  },
};

export default nextConfig;
