import type { NextConfig } from "next";

// Cache Components is off: every page reads the local SQLite file at request
// time, and the data changes whenever the pipeline is re-run.
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Pages read these at request time, so they must ship with every function
  // on Vercel: the database, its migrations, the config and the prompts.
  outputFileTracingIncludes: {
    "/**": ["./data/radar.db", "./drizzle/**/*", "./config/**/*", "./prompts/**/*"],
  },
  // Cost became Roles & Savings, then Salary & Roles; keep old links working.
  async redirects() {
    return [
      { source: "/cost", destination: "/salary", permanent: true },
      { source: "/savings", destination: "/salary", permanent: true },
    ];
  },  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
