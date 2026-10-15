import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker runtime image ships only .next/standalone (no node_modules install).
  output: "standalone",
  // Every page is per-user and realtime, so there is no static shell worth
  // prerendering. Cache Components would force a <Suspense> around every
  // session read for no gain. See ARCHITECTURE.md.
  cacheComponents: false,
  images: {
    // Media is served from S3 via presigned URLs and resized by the worker,
    // so Next's image optimizer (and `sharp` in the web image) isn't needed.
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
