/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");
const { writeFileSync } = require("node:fs");

const port = process.argv[2] || "3107";
const root = path.resolve(__dirname, "../..");
loadEnvConfig(root);
// Next may add generated type paths here without rewriting source-owned tsconfig.
writeFileSync(path.join(root, ".tsconfig.backend-test.json"), JSON.stringify({ extends: "./tsconfig.json" }, null, 2));
const preload = path.resolve(__dirname, "no-external-network.cjs");
const existingNodeOptions = process.env.NODE_OPTIONS || "";
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "dev", "--port", port],
  {
    cwd: root,
    env: {
      ...process.env,
      AI_GATEWAY_API_KEY: "",
      GEMINI_API_KEY: "",
      BACKEND_NO_EXTERNAL_NETWORK: "1",
      NODE_OPTIONS: `${existingNodeOptions} --require=${JSON.stringify(preload)}`.trim(),
    },
    stdio: "inherit",
  }
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
