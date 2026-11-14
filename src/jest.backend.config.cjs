// Keep the CI entry point loadable on Node 20 without a TypeScript loader.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const files = JSON.parse(
  readFileSync(resolve(__dirname, "__tests__/backend/backend-unit-files.json"), "utf8")
);

/** @type {import("jest").Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: files.map((file) => `<rootDir>/${file}`),
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  transform: { "^.+\\.(ts|tsx|js|jsx)$": "ts-jest" },
  clearMocks: true,
  coverageDirectory: "<rootDir>/__tests__/reports/coverage",
  testResultsProcessor: "<rootDir>/__tests__/backend/safe-jest-results.cjs",
  collectCoverageFrom: ["src/modules/**/*.{ts,tsx}", "app/api/**/route.ts"],
  coverageThreshold: {
    global: { statements: 75, branches: 60, functions: 75, lines: 75 },
    "./src/modules/auth/auth.guard.ts": { lines: 90, branches: 80 },
    "./src/modules/auth/auth.rate-limit.ts": { lines: 90, branches: 80 },
    "./src/modules/projects/project.guard.ts": { lines: 90, branches: 80 },
    "./src/modules/security/http-security.ts": { lines: 90, branches: 80 },
    "./src/modules/security/internal-diagnostics.ts": { lines: 90, branches: 80 },
    "./src/modules/security/workflow-transactions.ts": { lines: 90, branches: 80 },
    "./src/modules/participants/participants.repo.ts": { lines: 90, branches: 80 },
    "./src/modules/participants/participants.service.ts": { lines: 90, branches: 80 },
  },
};

module.exports = config;
