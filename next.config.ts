import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  // FFmpeg writes HLS segments into public/streams every second. Since that
  // lives under public/, the Next dev file watcher would treat each new segment
  // as a code change and trigger endless Fast Refresh rebuilds ("glitch").
  // Exclude that directory from the webpack dev watcher.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.next/**', '**/public/streams/**'],
      };
    }
    return config;
  },
};

export default nextConfig;
