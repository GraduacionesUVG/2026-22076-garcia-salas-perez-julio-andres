/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require("node:crypto");

function createRunManifest(startedAt = new Date().toISOString(), id = randomUUID(), context) {
  return {
    schemaVersion: 2,
    runId: `backend-${id}`,
    startedAt,
    finishedAt: null,
    context,
    phases: {},
  };
}

function startPhase(manifest, label, artifact, startedAt = new Date().toISOString()) {
  return {
    ...manifest,
    finishedAt: null,
    phases: {
      ...manifest.phases,
      [label]: { artifact, startedAt, finishedAt: null, exitCode: null },
    },
  };
}

function finishPhase(manifest, label, exitCode, finishedAt = new Date().toISOString()) {
  const phase = manifest.phases[label];
  if (!phase) throw new Error(`Cannot finish unstarted backend phase: ${label}`);
  return {
    ...manifest,
    phases: {
      ...manifest.phases,
      [label]: { ...phase, finishedAt, exitCode },
    },
  };
}

function validContext(context) {
  return Boolean(
    context &&
      typeof context.gitSha === "string" &&
      context.gitSha.length > 0 &&
      typeof context.dirty === "boolean" &&
      typeof context.nodeVersion === "string" &&
      context.nodeVersion.length > 0 &&
      typeof context.migrationsHash === "string" &&
      /^[a-f0-9]{64}$/iu.test(context.migrationsHash) &&
      typeof context.environmentHash === "string" &&
      (context.environmentHash === "not-configured" || /^[a-f0-9]{64}$/iu.test(context.environmentHash))
  );
}

function sameContext(left, right) {
  return (
    left.gitSha === right.gitSha &&
    left.dirty === right.dirty &&
    left.nodeVersion === right.nodeVersion &&
    left.migrationsHash === right.migrationsHash &&
    left.environmentHash === right.environmentHash
  );
}

function artifactCoherence(manifest, label, artifact, modifiedAtMs, expectedContext) {
  if (
    !manifest ||
    manifest.schemaVersion !== 2 ||
    typeof manifest.runId !== "string" ||
    !validContext(manifest.context)
  ) {
    return { coherent: false, diagnostic: "Run manifest is missing or invalid." };
  }
  if (!validContext(expectedContext) || !sameContext(manifest.context, expectedContext)) {
    return { coherent: false, diagnostic: "Run context does not match the current repository state." };
  }
  const phase = manifest.phases && manifest.phases[label];
  if (!phase) return { coherent: false, diagnostic: `Artifact is not owned by run phase ${label}.` };
  if (phase.artifact !== artifact) {
    return { coherent: false, diagnostic: `Artifact path does not match run phase ${label}.` };
  }
  if (
    typeof phase.startedAt !== "string" ||
    typeof phase.finishedAt !== "string" ||
    !Number.isInteger(phase.exitCode)
  ) {
    return { coherent: false, diagnostic: `Run phase ${label} is incomplete.` };
  }
  const startedAt = Date.parse(phase.startedAt);
  const finishedAt = Date.parse(phase.finishedAt);
  if (
    !Number.isFinite(modifiedAtMs) ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(finishedAt) ||
    modifiedAtMs < startedAt - 1000 ||
    modifiedAtMs > finishedAt + 1000
  ) {
    return { coherent: false, diagnostic: `Artifact timestamp is stale for run phase ${label}.` };
  }
  return { coherent: true };
}

module.exports = {
  artifactCoherence,
  createRunManifest,
  finishPhase,
  startPhase,
};
