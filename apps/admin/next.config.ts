import type { NextConfig } from "next";

const config: NextConfig = {
  // @eco/core é publicado como TypeScript puro dentro do monorepo; o Next transpila.
  transpilePackages: ["@eco/core"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
