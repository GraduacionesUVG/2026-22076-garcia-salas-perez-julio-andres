import { cleanupTask11Fixtures } from "@/__tests__/integration/analysis/task11-test-helpers";

describe("Task 11 fixture cleanup", () => {
  it("attempts both fixture cleanups and aggregates dual failures", async () => {
    const first = jest.fn().mockRejectedValue(new Error("primary cleanup failed"));
    const second = jest.fn().mockRejectedValue(new Error("foreign cleanup failed"));

    await expect(
      cleanupTask11Fixtures({ cleanup: first }, { cleanup: second })
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [expect.any(Error), expect.any(Error)],
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("still cleans the foreign fixture after the primary fixture fails", async () => {
    const foreign = jest.fn().mockResolvedValue(undefined);

    await expect(
      cleanupTask11Fixtures(
        { cleanup: jest.fn().mockRejectedValue(new Error("primary failed")) },
        { cleanup: foreign }
      )
    ).rejects.toThrow("primary failed");
    expect(foreign).toHaveBeenCalledTimes(1);
  });
});
