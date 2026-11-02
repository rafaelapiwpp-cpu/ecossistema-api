import type { NextConfig } from "next";

const config: NextConfig = {
  // @eco/core, @eco/tokens e @eco/ui são publicados como TypeScript puro dentro do monorepo; o Next transpila.
  transpilePackages: ["@eco/core", "@eco/tokens", "@eco/ui"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
