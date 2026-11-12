import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "100kb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders }];
  },
};

export default nextConfig;
