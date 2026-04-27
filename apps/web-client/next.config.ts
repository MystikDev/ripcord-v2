import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ripcord/ui"],
  // Standalone output bundles the minimal Node server + deps into .next/standalone,
  // letting us ship a tiny Docker image without bringing all node_modules along.
  output: "standalone",
};

export default nextConfig;
