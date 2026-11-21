import {
  closeTask9Resources,
  documentEditPreservesSegmentIntegrity,
  materializeRoute,
  readJsonObject,
  readUtf8Download,
} from "@/__tests__/integration/documents/task9-test-helpers";

function responseStub(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer;
}) {
  return {
    status: () => options.status ?? 200,
    headers: () => options.headers ?? {},
    body: async () => options.body ?? Buffer.alloc(0),
  };
}

describe("Task 9 response helpers", () => {
  it("reads a JSON object only from a JSON response", async () => {
    const response = responseStub({
      headers: { "content-type": "application/json; charset=utf-8" },
      body: Buffer.from('{"ok":true,"count":2}', "utf8"),
    });

    await expect(readJsonObject(response)).resolves.toEqual({ ok: true, count: 2 });
  });

  it("rejects non-JSON content types and non-object JSON bodies", async () => {
    await expect(
      readJsonObject(
        responseStub({
          headers: { "content-type": "text/html" },
          body: Buffer.from("<html></html>"),
        })
      )
    ).rejects.toThrow("Expected application/json");

    await expect(
      readJsonObject(
        responseStub({
          headers: { "content-type": "application/json" },
          body: Buffer.from("[]"),
        })
      )
    ).rejects.toThrow("Expected a JSON object");
  });

  it("validates text download headers and decodes strict UTF-8 bytes", async () => {
    const response = responseStub({
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": 'attachment; filename="entrevista.txt"',
      },
      body: Buffer.from("Niñez\n=2+3", "utf8"),
    });

    await expect(readUtf8Download(response, "entrevista.txt")).resolves.toEqual({
      bytes: Buffer.from("Niñez\n=2+3", "utf8"),
      text: "Niñez\n=2+3",
    });
  });

  it("rejects empty, malformed, or incorrectly labelled text downloads", async () => {
    await expect(
      readUtf8Download(
        responseStub({
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="x.txt"',
          },
          body: Buffer.from("text"),
        }),
        "x.txt"
      )
    ).rejects.toThrow("Expected text/plain; charset=utf-8");

    await expect(
      readUtf8Download(
        responseStub({
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "content-disposition": 'attachment; filename="x.txt"',
          },
          body: Buffer.from([0xc3, 0x28]),
        }),
        "x.txt"
      )
    ).rejects.toThrow("valid UTF-8");
  });
});

describe("Task 9 route and teardown helpers", () => {
  it("materializes every and only declared :param token", () => {
    expect(
      materializeRoute(
        "/api/projects/:id/documents/:documentId/versions/:versionId",
        { id: "project id", documentId: "doc/id", versionId: "version" }
      )
    ).toBe("/api/projects/project%20id/documents/doc%2Fid/versions/version");

    expect(() => materializeRoute("/api/projects/:id", {})).toThrow(
      "Missing route param: id"
    );
    expect(() =>
      materializeRoute("/api/projects/:id", { id: "one", extra: "two" })
    ).toThrow("Unexpected route param: extra");
  });

  it("cleans the project and closes sessions when both exist", async () => {
    const calls: string[] = [];

    await closeTask9Resources({
      fixture: { cleanup: async () => void calls.push("fixture") },
      sessions: { marker: "sessions" },
      closeSessions: async () => void calls.push("sessions"),
    });

    expect(calls).toEqual(["fixture", "sessions"]);
  });

  it("disposes an isolated anonymous context between fixture and session teardown", async () => {
    const calls: string[] = [];

    await closeTask9Resources({
      fixture: { cleanup: async () => void calls.push("fixture") },
      anonymous: { dispose: async () => void calls.push("anonymous") },
      sessions: { marker: "sessions" },
      closeSessions: async () => void calls.push("sessions"),
    });

    expect(calls).toEqual(["fixture", "anonymous", "sessions"]);
  });

  it("supports absent sessions and aggregates independent teardown failures", async () => {
    await expect(
      closeTask9Resources({
        fixture: { cleanup: async () => undefined },
      })
    ).resolves.toBeUndefined();

    const projectError = new Error("project cleanup failed");
    const sessionError = new Error("session close failed");
    await expect(
      closeTask9Resources({
        fixture: { cleanup: async () => Promise.reject(projectError) },
        sessions: { marker: "sessions" },
        closeSessions: async () => Promise.reject(sessionError),
      })
    ).rejects.toMatchObject({ errors: [projectError, sessionError] });
  });
});

describe("Task 9 document edit integrity", () => {
  it("accepts a rejected edit without requiring a segment reread", () => {
    expect(documentEditPreservesSegmentIntegrity({ editStatus: 409 })).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])(
    "does not treat unrelated HTTP %s as referential-integrity evidence",
    (editStatus) => {
      expect(documentEditPreservesSegmentIntegrity({ editStatus })).toBe(false);
    }
  );

  it("accepts a successful edit when the old segment is deleted", () => {
    expect(
      documentEditPreservesSegmentIntegrity({
        editStatus: 200,
        documentContent: "prefix alpha beta",
        segmentReadStatus: 404,
      })
    ).toBe(true);
  });

  it("accepts a successful edit only when the active segment matches the current slice", () => {
    const common = {
      editStatus: 200,
      documentContent: "prefix alpha beta",
      segmentReadStatus: 200,
    } as const;

    expect(
      documentEditPreservesSegmentIntegrity({
        ...common,
        segment: { start_char: 7, end_char: 12, selected_text: "alpha" },
      })
    ).toBe(true);
    expect(
      documentEditPreservesSegmentIntegrity({
        ...common,
        segment: { start_char: 0, end_char: 5, selected_text: "alpha" },
      })
    ).toBe(false);
  });
});
