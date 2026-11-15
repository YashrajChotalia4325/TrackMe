import type { NextConfig } from "next";

// TrackMe pages are per-user and always dynamic (they read the session), so
// Cache Components / partial prefetching are intentionally left off.
const nextConfig: NextConfig = {
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
