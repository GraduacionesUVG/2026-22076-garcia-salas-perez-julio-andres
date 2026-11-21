import {
  closeSync as realCloseSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const { acquireRunLock } = require("@/__tests__/backend/run-lock.cjs");

describe("acquireRunLock", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "backend-run-lock-"));
  });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock("node:fs");
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("rejects an overlapping local mutating run and permits a run after release", () => {
    const first = acquireRunLock(tempRoot);

    expect(() => acquireRunLock(tempRoot)).toThrow(
      "backend mutating run already active"
    );

    first.release();

    const next = acquireRunLock(tempRoot);
    next.release();
    expect(existsSync(path.join(tempRoot, ".backend-mutating-run.lock"))).toBe(false);
  });

  it("releases idempotently and writes only PID and timestamp metadata", () => {
    const lock = acquireRunLock(tempRoot);
    const metadata = JSON.parse(
      readFileSync(path.join(tempRoot, ".backend-mutating-run.lock"), "utf8")
    );

    expect(metadata).toEqual({
      pid: process.pid,
      startedAt: expect.any(String),
    });

    lock.release();
    expect(() => lock.release()).not.toThrow();
  });

  it("blocks a replacement acquisition at the old holder's unlink boundary", () => {
    const lockPath = path.join(tempRoot, ".backend-mutating-run.lock");
    const actualFs = jest.requireActual<typeof import("node:fs")>("node:fs");
    let acquiredAtBoundary: ReturnType<typeof acquireRunLock> | undefined;
    let boundaryError: unknown;
    let acquireAtBoundary: typeof acquireRunLock;

    jest.resetModules();
    jest.doMock("node:fs", () => ({
      ...actualFs,
      unlinkSync: jest.fn((target: string) => {
        if (target === lockPath && !acquiredAtBoundary && !boundaryError) {
          actualFs.unlinkSync(target);
          try {
            acquiredAtBoundary = acquireAtBoundary(tempRoot);
          } catch (error) {
            boundaryError = error;
          }
          return;
        }
        actualFs.unlinkSync(target);
      }),
    }));

    jest.isolateModules(() => {
      ({ acquireRunLock: acquireAtBoundary } = require(
        "@/__tests__/backend/run-lock.cjs"
      ));
    });

    const first = acquireAtBoundary(tempRoot);

    try {
      first.release();

      expect(acquiredAtBoundary).toBeUndefined();
      expect(boundaryError).toEqual(
        expect.objectContaining({ message: "backend mutating run already active" })
      );
    } finally {
      acquiredAtBoundary?.release();
    }
  });

  it("preserves the metadata write error when cleanup close also fails", () => {
    const writeError = new Error("metadata write failed");
    const closeError = new Error("metadata close failed");
    const closeSync = jest.fn((descriptor: number) => {
      realCloseSync(descriptor);
      throw closeError;
    });

    jest.resetModules();
    jest.doMock("node:fs", () => ({
      ...jest.requireActual("node:fs"),
      closeSync,
      writeFileSync: jest.fn(() => {
        throw writeError;
      }),
    }));

    let acquireWithWriteFailure: typeof acquireRunLock;
    jest.isolateModules(() => {
      ({ acquireRunLock: acquireWithWriteFailure } = require(
        "@/__tests__/backend/run-lock.cjs"
      ));
    });

    expect(() => acquireWithWriteFailure(tempRoot)).toThrow(writeError);
    expect(closeSync).toHaveBeenCalledTimes(1);
    expect(existsSync(path.join(tempRoot, ".backend-mutating-run.lock"))).toBe(false);
    expect(existsSync(path.join(tempRoot, ".backend-mutating-run.lock.guard"))).toBe(
      false
    );
  });
});
