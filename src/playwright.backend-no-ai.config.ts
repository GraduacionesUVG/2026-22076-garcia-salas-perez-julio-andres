import { defineConfig } from "@playwright/test";

const port = 3107;
const baseURL = `http://localhost:${port}`;
process.env.BACKEND_TEST_BASE_URL = baseURL;

export default defineConfig({
  testDir: "__tests__",
  testMatch: [
    "integration/ai/**/*.spec.ts",
    "integration/exports/project-exports.spec.ts",
  ],
  workers: 1,
  outputDir: "__tests__/reports/playwright-output/no-ai",
  fullyParallel: false,
  timeout: 120_000,
  use: { baseURL },
  webServer: {
    command: `node __tests__/backend/start-no-ai-server.cjs ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      AI_GATEWAY_API_KEY: "",
      GEMINI_API_KEY: "",
      BACKEND_NO_EXTERNAL_NETWORK: "1",
      AUTH_LOGIN_IP_RATE_LIMIT: "1000",
      AUTH_LOGIN_EMAIL_RATE_LIMIT: "1000",
      AUTH_REGISTER_IP_RATE_LIMIT: "1000",
      AUTH_REGISTER_EMAIL_RATE_LIMIT: "1000",
      ANALYSIS_CHAT_RATE_LIMIT: "1",
      DELIMITATION_CHAT_RATE_LIMIT: "1",
      DELIMITATION_REVIEW_RATE_LIMIT: "1",
      RESEARCH_DESIGN_CHAT_RATE_LIMIT: "1",
      RESEARCH_DESIGN_REVIEW_RATE_LIMIT: "1",
      SAMPLE_CONFIG_CHAT_RATE_LIMIT: "1",
      SAMPLE_CONFIG_REVIEW_RATE_LIMIT: "1",
      NEXT_DIST_DIR: process.env.BACKEND_NO_AI_NEXT_DIST_DIR ?? ".next-backend-no-ai",
    },
  },
});
