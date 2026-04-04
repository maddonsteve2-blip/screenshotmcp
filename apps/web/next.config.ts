import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@screenshotsmcp/db", "@screenshotsmcp/types"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

export default nextConfig;
