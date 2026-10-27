import type { NextConfig } from "next";

// Cache Components is off: every page reads the local SQLite file at request
// time, and the data changes whenever the pipeline is re-run.
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
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
