import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow the Z.ai preview panel origin to load _next/* resources without
  // the cross-origin warning that breaks HMR + asset loading in the preview.
  allowedDevOrigins: ["*.space-z.ai", "localhost", "127.0.0.1"],
};

export default nextConfig;
