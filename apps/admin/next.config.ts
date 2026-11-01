import type { NextConfig } from "next";

const config: NextConfig = {
  // @eco/core e @eco/tokens são publicados como TypeScript puro dentro do monorepo; o Next transpila.
  transpilePackages: ["@eco/core", "@eco/tokens"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
