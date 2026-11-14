import {
  assignedResource,
  cleanupAfterSetupFailure,
  closeAssignedResources,
} from "@/__tests__/integration/security/task14-test-helpers";

describe("Task 14 assigned resource cleanup", () => {
  it("retains the assigned reference when cleanup fails so it can be retried", async () => {
    const failure = new Error("cleanup failed");
    const close = jest.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const resource = assignedResource(close);
    const value = { id: "owned" };
    resource.assign(value);

    await expect(resource.close()).rejects.toBe(failure);
    expect(resource.current).toBe(value);
    await expect(resource.close()).resolves.toBeUndefined();
    expect(resource.current).toBeUndefined();
  });

  it("clears an assigned context after successful closing and never closes it twice", async () => {
    const closed: string[] = [];
    const resource = assignedResource<string>(async (value) => {
      expect(resource.current).toBe("context");
      closed.push(value);
    });
    resource.assign("context");

    await closeAssignedResources([resource], "cleanup failed");
    await closeAssignedResources([resource], "cleanup failed");

    expect(resource.current).toBeUndefined();
    expect(closed).toEqual(["context"]);
  });

  it("attempts every close and flattens aggregate cleanup failures", async () => {
    const closed: string[] = [];
    const first = assignedResource<string>(async (value) => {
      closed.push(value);
      throw new AggregateError([new Error("one"), new Error("two")]);
    });
    const second = assignedResource<string>(async (value) => {
      closed.push(value);
      throw new Error("three");
    });
    first.assign("first");
    second.assign("second");

    const result = closeAssignedResources([first, second], "cleanup failed");

    await expect(result).rejects.toMatchObject({
      message: "cleanup failed",
      errors: [
        expect.objectContaining({ message: "one" }),
        expect.objectContaining({ message: "two" }),
        expect.objectContaining({ message: "three" }),
      ],
    });
    expect(closed).toEqual(["first", "second"]);
  });

  it("preserves the original setup error when cleanup also fails", async () => {
    const setupError = new Error("setup failed");
    const cleanupError = new Error("cleanup failed");
    const resource = assignedResource<string>(async () => {
      throw cleanupError;
    });
    resource.assign("context");

    const result = cleanupAfterSetupFailure(
      setupError,
      [resource],
      "setup and cleanup failed"
    );

    await expect(result).rejects.toMatchObject({
      message: "setup and cleanup failed",
      errors: [setupError, cleanupError],
    });
  });

  it("rethrows the original setup error when cleanup succeeds", async () => {
    const setupError = new Error("setup failed");

    await expect(
      cleanupAfterSetupFailure(setupError, [], "setup and cleanup failed")
    ).rejects.toBe(setupError);
  });
});
