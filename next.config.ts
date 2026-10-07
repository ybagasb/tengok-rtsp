import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  // FFmpeg writes HLS segments into public/streams every second. Since that
  // lives under public/, the Next dev file watcher would treat each new segment
  // as a code change and trigger endless Fast Refresh rebuilds ("glitch").
  // Exclude that directory from the webpack dev watcher.
  webpack: (config, { dev, nextRuntime }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.next/**', '**/public/streams/**'],
      };
    }
    // instrumentation.ts dianalisis juga untuk runtime edge, padahal register()
    // hanya memuat ffmpegManager (yang butuh child_process/fs/path) saat
    // NEXT_RUNTIME === 'nodejs'. Pada kompilasi edge, modul inti Node tidak
    // tersedia → "Module not found". Matikan resolusinya khusus edge; kode ini
    // memang tidak pernah dijalankan di edge.
    if (nextRuntime === 'edge') {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        child_process: false,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default nextConfig;
