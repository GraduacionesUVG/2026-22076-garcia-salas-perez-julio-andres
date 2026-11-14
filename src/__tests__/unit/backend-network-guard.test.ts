/* eslint-disable @typescript-eslint/no-require-imports */
import backendNoAiConfig from "@/playwright.backend-no-ai.config";
import backendConfig from "@/playwright.backend.config";
import defaultConfig from "@/playwright.config";
import packageJson from "@/package.json";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const {
  createNetworkGuard,
  isAllowedDestination,
} = require("../backend/no-external-network.cjs");

describe("no-external-network server preload", () => {
  const supabaseUrl = "https://project-ref.supabase.co";

  it.each([
    "http://localhost:3107/api/health",
    "http://127.0.0.1:54321/rest/v1/projects",
    "http://[::1]:3000/",
    `${supabaseUrl}/auth/v1/user`,
  ])("allows local and configured Supabase destinations: %s", (destination) => {
    expect(isAllowedDestination(destination, supabaseUrl)).toBe(true);
  });

  it.each([
    "https://gateway.ai.cloudflare.com/v1/account",
    "https://api.openai.com/v1/responses",
    "http://example.com/",
  ])("rejects every other destination: %s", (destination) => {
    expect(isAllowedDestination(destination, supabaseUrl)).toBe(false);
  });

  it("blocks fetch, http, and https before their transports are called", async () => {
    const fetchImpl = jest.fn();
    const httpRequest = jest.fn();
    const httpsRequest = jest.fn();
    const guard = createNetworkGuard({
      supabaseUrl,
      fetchImpl,
      httpRequest,
      httpGet: jest.fn(),
      httpsRequest,
      httpsGet: jest.fn(),
    });

    await expect(guard.fetch("https://api.openai.com/v1/models")).rejects.toThrow(
      "Outbound network blocked"
    );
    expect(() => guard.httpRequest("http://example.com/")).toThrow(
      "Outbound network blocked"
    );
    expect(() => guard.httpsRequest("https://example.com/")).toThrow(
      "Outbound network blocked"
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(httpRequest).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("passes allowed destinations through unchanged", async () => {
    const response = { ok: true };
    const fetchImpl = jest.fn().mockResolvedValue(response);
    const httpRequest = jest.fn().mockReturnValue("local-request");
    const guard = createNetworkGuard({
      supabaseUrl,
      fetchImpl,
      httpRequest,
      httpGet: jest.fn(),
      httpsRequest: jest.fn(),
      httpsGet: jest.fn(),
    });

    await expect(guard.fetch("http://localhost:3107/api/health")).resolves.toBe(
      response
    );
    expect(guard.httpRequest(new URL("http://127.0.0.1:54321/rest/v1/"))).toBe(
      "local-request"
    );
  });
});

describe("guarded Playwright discovery", () => {
  it("loads Next environment variables before installing the outbound guard", () => {
    const launcher = readFileSync(
      resolve(process.cwd(), "__tests__/backend/start-no-ai-server.cjs"),
      "utf8"
    );
    expect(launcher).toContain('require("@next/env")');
    expect(launcher.indexOf("loadEnvConfig(root)")).toBeLessThan(
      launcher.indexOf("spawn(")
    );
  });

  it("routes ordinary backend specs through a fresh guarded server", () => {
    expect(backendConfig.workers).toBe(1);
    expect(backendConfig.fullyParallel).toBe(false);
    expect(backendConfig.projects).toEqual([
      expect.objectContaining({ name: "backend" }),
    ]);
    expect(backendConfig.testIgnore).toEqual(
      expect.arrayContaining([
        "integration/api.*.spec.ts",
        "integration/auth/qa-accounts.spec.ts",
        "integration/ai/**/*.spec.ts",
        "integration/exports/project-exports.spec.ts",
      ])
    );
    const server = backendConfig.webServer as { command: string; reuseExistingServer: boolean; env: Record<string, string> };
    expect(server.command).toBe(`node __tests__/backend/start-no-ai-server.cjs ${process.env.BACKEND_TEST_PORT ?? 3106}`);
    expect(server.reuseExistingServer).toBe(process.env.BACKEND_REUSE_EXISTING_SERVER === "1");
    expect(server.env.AI_GATEWAY_API_KEY === "").toBe(true);
    expect(server.env.GEMINI_API_KEY === "").toBe(true);
    for (const key of ["BACKEND_NO_EXTERNAL_NETWORK", "AUTH_LOGIN_IP_RATE_LIMIT", "AUTH_LOGIN_EMAIL_RATE_LIMIT", "AUTH_REGISTER_IP_RATE_LIMIT", "AUTH_REGISTER_EMAIL_RATE_LIMIT"]) {
      expect(server.env[key]).toBe(key === "BACKEND_NO_EXTERNAL_NETWORK" ? "1" : "1000");
    }
  });

  it("keeps generic API commands on guarded configs and the no-AI command explicit", () => {
    expect(defaultConfig.testIgnore).toEqual(
      expect.arrayContaining([
        "integration/ai/**/*.spec.ts",
        "integration/exports/project-exports.spec.ts",
      ])
    );
    expect(packageJson.scripts["test:integration"]).toContain(
      "--config=playwright.backend.config.ts"
    );
    expect(packageJson.scripts["test:api"]).toContain(
      "--config=playwright.backend.config.ts"
    );
    expect(packageJson.scripts["test:backend:no-ai"]).toBe(
      "node scripts/backend-test-report.mjs run-no-ai"
    );
    expect(packageJson.scripts["test:backend:e2e"]).toBe(
      "node scripts/backend-test-report.mjs run-backend-e2e"
    );

    const runner = readFileSync(
      resolve(process.cwd(), "scripts/backend-test-report.mjs"),
      "utf8"
    );
    expect(runner).toContain('relative.startsWith("__tests__/integration/api.")');
    expect(runner).toContain('"__tests__/integration/ai"');
    expect(runner).toContain(
      '"__tests__/integration/exports/project-exports.spec.ts"'
    );
    expect(runner.indexOf('"backend-e2e"')).toBeLessThan(
      runner.lastIndexOf('"cleanup-audit"')
    );
  });

  it("includes AI and Task13 exports with the network guard on and AI key blank", () => {
    expect(backendNoAiConfig.testMatch).toEqual([
      "integration/ai/**/*.spec.ts",
      "integration/exports/project-exports.spec.ts",
    ]);
    const server = backendNoAiConfig.webServer as { env: Record<string, string> };
    expect(server.env.AI_GATEWAY_API_KEY === "").toBe(true);
    expect(server.env.GEMINI_API_KEY === "").toBe(true);
    expect(server.env.BACKEND_NO_EXTERNAL_NETWORK).toBe("1");
    expect(server.env.AUTH_REGISTER_IP_RATE_LIMIT).toBe("1000");
    expect(server.env.AUTH_REGISTER_EMAIL_RATE_LIMIT).toBe("1000");
  });

  it.each([undefined, "3199"])("keeps config diagnostics free of inherited credentials at port %s", port => {
    const original = process.env;
    const playwright = require("@playwright/test");
    jest.doMock("@playwright/test", () => playwright);
    try {
      process.env = { NODE_ENV: "test", TEST_USER_PASSWORD: "synthetic-password-only", ...(port ? { BACKEND_TEST_PORT: port } : {}) };
      jest.isolateModules(() => {
        const config = require("../../playwright.backend.config").default;
        expect(config.webServer.command).toBe(`node __tests__/backend/start-no-ai-server.cjs ${port ?? 3106}`);
        expect(config.use.baseURL).toBe(`http://localhost:${port ?? 3106}`);
        expect(JSON.stringify(config)).not.toContain("synthetic-password-only");
      });
    } finally { process.env = original; jest.dontMock("@playwright/test"); }
  });
});
