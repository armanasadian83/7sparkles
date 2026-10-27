import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*", "./tests/**/*", "./artifacts/**/*", "**/*.sqlite", "**/*.sqlite-wal", "**/*.sqlite-shm"],
  },
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "tailwind.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
