import { defineConfig } from "@playwright/test";

const port = Number(process.env.BACKEND_TEST_PORT ?? 3106);
const baseURL = process.env.BACKEND_TEST_BASE_URL ?? `http://localhost:${port}`;
process.env.BACKEND_TEST_BASE_URL = baseURL;

export default defineConfig({
  testDir: "__tests__",
  testMatch: ["integration/**/*.spec.ts", "e2e/backend/**/*.spec.ts"],
  testIgnore: [
    // Superseded by fixed-QA contract specs; these legacy specs create permanent random users.
    "integration/api.*.spec.ts",
    "integration/auth/qa-accounts.spec.ts",
    "integration/ai/**/*.spec.ts",
    "integration/exports/project-exports.spec.ts",
  ],
  workers: 1,
  outputDir: "__tests__/reports/playwright-output/backend",
  fullyParallel: false,
  projects: [{ name: "backend", use: { baseURL } }],
  use: { baseURL },
  webServer: {
    command: `node __tests__/backend/start-no-ai-server.cjs ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: process.env.BACKEND_REUSE_EXISTING_SERVER === "1",
    timeout: 120_000,
    env: {
      AI_GATEWAY_API_KEY: "",
      GEMINI_API_KEY: "",
      BACKEND_NO_EXTERNAL_NETWORK: "1",
      AUTH_LOGIN_IP_RATE_LIMIT: "1000",
      AUTH_LOGIN_EMAIL_RATE_LIMIT: "1000",
      AUTH_REGISTER_IP_RATE_LIMIT: "1000",
      AUTH_REGISTER_EMAIL_RATE_LIMIT: "1000",
      NEXT_DIST_DIR: process.env.BACKEND_NEXT_DIST_DIR ?? ".next-backend-test",
    },
  },
});
