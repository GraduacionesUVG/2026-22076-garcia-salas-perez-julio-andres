/* eslint-disable @typescript-eslint/no-require-imports */
const {
  artifactCoherence,
  createRunManifest,
  finishPhase,
  startPhase,
} = require("../backend/run-manifest.cjs");

const context = {
  gitSha: "abc123",
  dirty: false,
  nodeVersion: "v22.0.0",
  migrationsHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  environmentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

describe("backend run manifest", () => {
  it("records one run id and phase timestamps, artifact ownership, and exit code", () => {
    let manifest = createRunManifest(
      "2026-07-12T18:00:00.000Z",
      "11111111-1111-4111-8111-111111111111",
      context
    );
    manifest = startPhase(
      manifest,
      "integration",
      "__tests__/reports/playwright-backend-integration.json",
      "2026-07-12T18:01:00.000Z"
    );
    manifest = finishPhase(
      manifest,
      "integration",
      1,
      "2026-07-12T18:02:00.000Z"
    );

    expect(manifest).toMatchObject({
      schemaVersion: 2,
      context,
      runId: "backend-11111111-1111-4111-8111-111111111111",
      startedAt: "2026-07-12T18:00:00.000Z",
      phases: {
        integration: {
          artifact: "__tests__/reports/playwright-backend-integration.json",
          startedAt: "2026-07-12T18:01:00.000Z",
          finishedAt: "2026-07-12T18:02:00.000Z",
          exitCode: 1,
        },
      },
    });
  });

  it("rejects stale, unowned, unfinished, and mismatched artifacts", () => {
    let manifest = createRunManifest(
      "2026-07-12T18:00:00.000Z",
      "11111111-1111-4111-8111-111111111111",
      context
    );
    manifest = startPhase(manifest, "unit", "unit.json", "2026-07-12T18:01:00.000Z");
    expect(artifactCoherence(manifest, "unit", "unit.json", Date.parse("2026-07-12T18:01:30.000Z"), context)).toMatchObject({ coherent: false });

    manifest = finishPhase(manifest, "unit", 0, "2026-07-12T18:02:00.000Z");
    expect(artifactCoherence(manifest, "integration", "unit.json", Date.parse("2026-07-12T18:01:30.000Z"), context)).toMatchObject({ coherent: false });
    expect(artifactCoherence(manifest, "unit", "old.json", Date.parse("2026-07-12T18:01:30.000Z"), context)).toMatchObject({ coherent: false });
    expect(artifactCoherence(manifest, "unit", "unit.json", Date.parse("2026-07-11T18:01:30.000Z"), context)).toMatchObject({ coherent: false });
    expect(artifactCoherence(manifest, "unit", "unit.json", Date.parse("2026-07-12T18:01:30.000Z"), context)).toEqual({ coherent: true });
  });

  it("rejects a missing SHA or changed repository context before timestamps", () => {
    let manifest = createRunManifest("2026-07-12T18:00:00.000Z", "id", context);
    manifest = startPhase(manifest, "unit", "unit.json", "2026-07-12T18:01:00.000Z");
    manifest = finishPhase(manifest, "unit", 0, "2026-07-12T18:02:00.000Z");
    const now = Date.parse("2026-07-12T18:01:30.000Z");

    expect(artifactCoherence(manifest, "unit", "unit.json", now, { ...context, gitSha: "" })).toMatchObject({ coherent: false });
    expect(artifactCoherence(manifest, "unit", "unit.json", now, { ...context, gitSha: "def456" })).toMatchObject({ coherent: false, diagnostic: "Run context does not match the current repository state." });
    expect(artifactCoherence({ ...manifest, context: { ...context, dirty: true } }, "unit", "unit.json", now, context)).toMatchObject({ coherent: false });
    expect(artifactCoherence({ ...manifest, context: { ...context, migrationsHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" } }, "unit", "unit.json", now, context)).toMatchObject({ coherent: false, diagnostic: "Run context does not match the current repository state." });
  });
});
