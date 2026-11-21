import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/projects/*/exports/*": ["./src/modules/exports/fonts/*"],
  },
  // Test runners can provide an isolated build directory so a dedicated
  // backend server never contends with a developer's local `.next` process.
  // Production and normal development keep Next's default `.next` directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  ...(process.env.BACKEND_NO_EXTERNAL_NETWORK === "1"
    ? { typescript: { tsconfigPath: ".tsconfig.backend-test.json" } }
    : {}),
};

export default nextConfig;
