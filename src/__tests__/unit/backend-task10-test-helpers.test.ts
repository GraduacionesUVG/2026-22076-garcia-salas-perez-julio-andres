import {
  classifyOneWinnerRace,
  closeTask10Resources,
  codeFixtureData,
  codeDeletionPreservesReferenceIntegrity,
  hasAcyclicParentGraph,
  segmentSelection,
  task10Route,
} from "@/__tests__/backend/task10-test-helpers";

describe("Task 10 code fixture data", () => {
  it("supplies non-null database text fields and preserves explicit overrides", () => {
    expect(codeFixtureData({
      name: "override name",
      description: "custom description",
      definition: "custom definition",
    })).toEqual({
      description: "custom description",
      definition: "custom definition",
      inclusion_criteria: "QA inclusion criteria",
      exclusion_criteria: "QA exclusion criteria",
      name: "override name",
    });
  });
});

describe("Task 10 segment selection helper", () => {
  it("returns UTF-16 offsets across an emoji surrogate pair", () => {
    expect(segmentSelection("alpha 😀 beta", "beta")).toEqual({
      start_char: 9,
      end_char: 13,
      selected_text: "beta",
    });
  });

  it("normalizes CRLF before calculating persisted document offsets", () => {
    expect(segmentSelection("first\r\nsecond", "second")).toEqual({
      start_char: 6,
      end_char: 12,
      selected_text: "second",
    });
  });

  it("selects a requested repeated occurrence", () => {
    expect(segmentSelection("same / same", "same", 1)).toMatchObject({
      start_char: 7,
      end_char: 11,
    });
  });

  it.each([
    ["missing text", "needle", 0],
    ["one needle", "needle", 1],
    ["text", "", 0],
  ])("rejects an unavailable selection %#", (content, selected, occurrence) => {
    expect(() => segmentSelection(content, selected, occurrence)).toThrow(
      "Selection is not present in normalized content"
    );
  });
});

describe("Task 10 route materialization", () => {
  it("requires every and only declared route parameter", () => {
    expect(
      task10Route(
        "/api/projects/:id/analysis/segments/:segmentId/codes/:segmentCodeId",
        { id: "project id", segmentId: "segment/id", segmentCodeId: "assignment" }
      )
    ).toBe("/api/projects/project%20id/analysis/segments/segment%2Fid/codes/assignment");
    expect(() => task10Route("/api/projects/:id", {})).toThrow(
      "Missing route param: id"
    );
    expect(() => task10Route("/api/projects/:id", { id: "p", codeId: "c" })).toThrow(
      "Unexpected route param: codeId"
    );
  });
});

describe("Task 10 teardown", () => {
  it("attempts anonymous and authenticated context teardown independently", async () => {
    const anonymousError = new Error("anonymous disposal failed");
    const sessionsError = new Error("session close failed");

    await expect(
      closeTask10Resources({
        anonymous: { dispose: async () => Promise.reject(anonymousError) },
        sessions: { marker: "sessions" },
        closeSessions: async () => Promise.reject(sessionsError),
      })
    ).rejects.toMatchObject({ errors: [anonymousError, sessionsError] });
  });
});

describe("Task 10 race classifier", () => {
  it.each([
    [[201, 409], 201, 409],
    [[409, 200], 200, 409],
  ])("accepts exactly one winner and one conflict", (statuses, success, conflict) => {
    expect(classifyOneWinnerRace(statuses, success, conflict)).toEqual({
      winnerIndex: statuses.indexOf(success),
      conflictIndex: statuses.indexOf(conflict),
    });
  });

  it.each([[[201, 201]], [[409, 409]], [[201, 500]], [[201]]])(
    "rejects a non-atomic terminal state %#",
    (statuses) => {
      expect(() => classifyOneWinnerRace(statuses, 201, 409)).toThrow(
        "Expected exactly one success and one conflict"
      );
    }
  );
});

describe("Task 10 persisted integrity helpers", () => {
  it("accepts rejected code deletion and successful deletion without active orphans", () => {
    expect(codeDeletionPreservesReferenceIntegrity({ deleteStatus: 409 })).toBe(true);
    expect(
      codeDeletionPreservesReferenceIntegrity({
        deleteStatus: 200,
        targetCodeActive: false,
        activeChildren: [],
        activeAssignments: [],
      })
    ).toBe(true);
  });

  it.each([400, 401, 403, 404, 422])(
    "does not treat unrelated HTTP %s as reference-integrity evidence",
    (deleteStatus) => {
      expect(codeDeletionPreservesReferenceIntegrity({ deleteStatus })).toBe(false);
    }
  );

  it("rejects successful deletion that leaves an active child or assignment orphaned", () => {
    expect(
      codeDeletionPreservesReferenceIntegrity({
        deleteStatus: 200,
        targetCodeActive: false,
        activeChildren: [{ parent_code_id: "deleted-code" }],
        activeAssignments: [],
        targetCodeId: "deleted-code",
      })
    ).toBe(false);
    expect(
      codeDeletionPreservesReferenceIntegrity({
        deleteStatus: 200,
        targetCodeActive: false,
        activeChildren: [],
        activeAssignments: [{ code_id: "deleted-code" }],
        targetCodeId: "deleted-code",
      })
    ).toBe(false);
  });

  it("detects reciprocal and longer parent cycles", () => {
    expect(
      hasAcyclicParentGraph([
        { id: "a", parent_code_id: "b" },
        { id: "b", parent_code_id: null },
      ])
    ).toBe(true);
    expect(
      hasAcyclicParentGraph([
        { id: "a", parent_code_id: "b" },
        { id: "b", parent_code_id: "a" },
      ])
    ).toBe(false);
    expect(
      hasAcyclicParentGraph([
        { id: "a", parent_code_id: "b" },
        { id: "b", parent_code_id: "c" },
        { id: "c", parent_code_id: "a" },
      ])
    ).toBe(false);
  });
});
