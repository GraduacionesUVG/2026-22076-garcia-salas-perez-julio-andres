/* eslint-disable @typescript-eslint/no-require-imports */
const { closeSync, mkdirSync, openSync, rmdirSync, unlinkSync, writeFileSync } = require("node:fs");
const path = require("node:path");

function isAlreadyActive(error) {
  return error && error.code === "EEXIST";
}

function cleanupOwnedLock(descriptor, lockPath, guardPath, suppressErrors) {
  let cleanupError;
  const cleanups = [
    () => closeSync(descriptor),
    () => unlinkSync(lockPath),
    () => rmdirSync(guardPath),
  ];

  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      cleanupError ??= error;
    }
  }

  if (cleanupError && !suppressErrors) throw cleanupError;
}

function removeGuardAfterFailedAcquire(guardPath) {
  try {
    rmdirSync(guardPath);
  } catch {
    // A failed acquisition must preserve its original error.
  }
}

function acquireRunLock(root) {
  const lockPath = path.join(root, ".backend-mutating-run.lock");
  const guardPath = `${lockPath}.guard`;

  try {
    mkdirSync(guardPath);
  } catch (error) {
    if (isAlreadyActive(error)) {
      throw new Error("backend mutating run already active");
    }
    throw error;
  }

  let descriptor;

  try {
    descriptor = openSync(lockPath, "wx");
  } catch (error) {
    removeGuardAfterFailedAcquire(guardPath);
    if (isAlreadyActive(error)) {
      throw new Error("backend mutating run already active");
    }
    throw error;
  }

  try {
    writeFileSync(
      descriptor,
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
      "utf8"
    );
  } catch (error) {
    cleanupOwnedLock(descriptor, lockPath, guardPath, true);
    throw error;
  }

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      cleanupOwnedLock(descriptor, lockPath, guardPath, false);
    },
  };
}

module.exports = { acquireRunLock };
