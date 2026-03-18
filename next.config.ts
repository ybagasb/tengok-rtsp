import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Proxy semua request ke /shinobi-proxy/* → ke Shinobi HTTP internal
    // Ini memungkinkan browser (HTTPS) mengakses stream tanpa Mixed Content error
    const shinobiHost = process.env.SHINOBI_HOST || "http://10.10.56.89:8080";
    return [
      {
        source: "/shinobi-proxy/:path*",
        destination: `${shinobiHost}/:path*`, // Default (old behavior) -> .89
      },
      {
        source: "/shinobi-proxy-90/:path*",
        destination: "http://10.10.56.90:8080/:path*",
      },
      {
        source: "/shinobi-proxy-94/:path*",
        destination: "http://10.10.56.94:8080/:path*",
      },
      {
        source: "/shinobi-proxy-101/:path*",
        destination: "http://10.10.56.101:8080/:path*",
      },
    ];
  },
};

export default nextConfig;
