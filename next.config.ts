import type { NextConfig } from "next";

// Cache Components is off: every page reads the local SQLite file at request
// time, and the data changes whenever the pipeline is re-run.
const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
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
