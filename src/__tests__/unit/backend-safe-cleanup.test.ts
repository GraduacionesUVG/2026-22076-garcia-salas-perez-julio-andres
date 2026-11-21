import {
  ResourceRegistry,
  type ResourceRecord,
} from "@/__tests__/backend/resource-registry";
import {
  cleanupProject,
  cleanupRegisteredResources,
  type CleanupTransport,
  type CleanupTransportResponse,
} from "@/__tests__/backend/safe-cleanup";

const RUN_MARKER =
  "E2E_20260712T030405_123e4567-e89b-42d3-a456-426614174000";
const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";

function project(id = PROJECT_ID, marker = RUN_MARKER): ResourceRecord {
  return { kind: "project", id, marker };
}

function fakeTransport(
  responses: Array<CleanupTransportResponse | Error>
): CleanupTransport & { requests: Array<{ method: string; path: string }> } {
  const requests: Array<{ method: string; path: string }> = [];

  return {
    requests,
    async request(request) {
      requests.push(request);
      const response = responses.shift();

      if (!response) {
        throw new Error("Unexpected transport request");
      }

      if (response instanceof Error) {
        throw response;
      }

      return response;
    },
  };
}

describe("ResourceRegistry", () => {
  it("unregisters only one exact resource after external confirmed deletion", () => {
    const registry = new ResourceRegistry();
    const first = project();
    const second = project("123e4567-e89b-42d3-a456-426614174001");
    registry.register(first);
    registry.register(second);

    expect(registry.unregister("project", first.id)).toBe(true);
    expect(registry.list()).toEqual([second]);
    expect(registry.unregister("project", first.id)).toBe(false);
  });

  it("registers and returns resources by exact kind and ID", () => {
    const registry = new ResourceRegistry();
    const first = project("123e4567-e89b-42d3-a456-426614174001");
    const second = project("123e4567-e89b-42d3-a456-426614174010");

    registry.register(first);
    registry.register(second);

    expect(registry.get("project", first.id)).toEqual(first);
    expect(registry.get("project", first.id.slice(0, -1))).toBeUndefined();
  });

  it("ignores an identical duplicate registration", () => {
    const registry = new ResourceRegistry();
    const resource = project();

    registry.register(resource);
    registry.register({ ...resource });

    expect(registry.list()).toEqual([resource]);
  });

  it("rejects a duplicate resource registered with a different marker", () => {
    const registry = new ResourceRegistry();
    registry.register(project());

    expect(() =>
      registry.register(project(PROJECT_ID, "E2E_another-run"))
    ).toThrow("already registered with a different marker");
  });

  it("does not expose mutable registry state from get", () => {
    const registry = new ResourceRegistry();
    registry.register(project());

    const returned = registry.get("project", PROJECT_ID) as ResourceRecord;
    returned.marker = "E2E_changed";

    expect(registry.get("project", PROJECT_ID)).toEqual(project());
  });
});

describe("cleanupProject", () => {
  it("deletes one exact owned project and confirms it is inaccessible", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: 200, body: { ok: true } },
      { status: 404, body: { ok: false } },
    ]);

    await cleanupProject(project(), RUN_MARKER, transport);

    expect(transport.requests).toEqual([
      { method: "GET", path: `/api/projects/${PROJECT_ID}` },
      { method: "DELETE", path: `/api/projects/${PROJECT_ID}` },
      { method: "GET", path: `/api/projects/${PROJECT_ID}` },
    ]);
  });

  it("accepts 403 only after documented deletion and an owner list proves absence", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: 200, body: { ok: true } },
      { status: 403 },
      { status: 200, body: { projects: [] } },
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).resolves.toBeUndefined();
    expect(transport.requests.at(-1)).toEqual({ method: "GET", path: "/api/projects" });
  });

  it("rejects 403 when the owner list still contains the project", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: 200, body: { ok: true } },
      { status: 403 },
      {
        status: 200,
        body: { projects: [{ id: PROJECT_ID, name: `${RUN_MARKER} project` }] },
      },
    ]);

    await expect(cleanupProject(project(), RUN_MARKER, transport)).rejects.toThrow(
      "Could not confirm deletion"
    );
  });

  it("rejects 403 without the documented successful deletion body", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: 204 },
      { status: 403 },
      { status: 200, body: { projects: [] } },
    ]);

    await expect(cleanupProject(project(), RUN_MARKER, transport)).rejects.toThrow(
      "Could not confirm deletion"
    );
  });

  it("refuses a resource record whose marker differs from the current run", async () => {
    const transport = fakeTransport([]);

    await expect(
      cleanupProject(project(PROJECT_ID, "E2E_another-run"), RUN_MARKER, transport)
    ).rejects.toThrow("Refusing to delete unowned resource");
    expect(transport.requests).toEqual([]);
  });

  it.each([
    "",
    "E2E_20260712T030405",
    "E2E_20260712T030405_123e4567-e89b-12d3-a456-426614174000",
    `${RUN_MARKER}_extra`,
    RUN_MARKER.toUpperCase(),
  ])("rejects an invalid or prefix-confusable run marker: %s", async (marker) => {
    const transport = fakeTransport([]);

    await expect(
      cleanupProject(project(PROJECT_ID, marker), marker, transport)
    ).rejects.toThrow("Refusing to delete unowned resource");
    expect(transport.requests).toEqual([]);
  });

  it("refuses a project whose returned name lacks the current marker", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: "Production project" } },
      },
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toThrow("Refusing to delete unowned resource");
    expect(transport.requests).toEqual([
      { method: "GET", path: `/api/projects/${PROJECT_ID}` },
    ]);
  });

  it.each([
    { name: `${RUN_MARKER} project` },
    {
      id: "123e4567-e89b-42d3-a456-426614174099",
      name: `${RUN_MARKER} project`,
    },
  ])("refuses ownership data with a missing or mismatched ID: %#", async (data) => {
    const transport = fakeTransport([
      { status: 200, body: { project: data } },
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toThrow("Refusing to delete unowned resource");
    expect(transport.requests).toHaveLength(1);
  });

  it.each([
    { status: 500, body: { error: "failed" } },
    { status: 200, body: { project: {} } },
  ])("fails closed when ownership verification fails: %#", async (response) => {
    const transport = fakeTransport([response]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toThrow("Refusing to delete unowned resource");
    expect(transport.requests).toHaveLength(1);
  });

  it("reports a failed ownership request as an ownership refusal", async () => {
    const cause = new Error("network failed");
    const transport: CleanupTransport = {
      request: jest.fn().mockRejectedValue(cause),
    };

    let caught: unknown;
    try {
      await cleanupProject(project(), RUN_MARKER, transport);
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      message: expect.stringContaining("Refusing to delete unowned resource"),
      cause,
    });
  });

  it("rejects a malformed successful DELETE status", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: Number.NaN },
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toThrow("Project deletion failed");
    expect(transport.requests).toHaveLength(2);
  });

  it("propagates a thrown DELETE failure without attempting confirmation", async () => {
    const failure = new Error("DELETE transport failed");
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      failure,
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toBe(failure);
    expect(transport.requests).toHaveLength(2);
  });

  it("propagates a thrown confirmation GET failure", async () => {
    const failure = new Error("confirmation transport failed");
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: 200 },
      failure,
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toBe(failure);
    expect(transport.requests).toHaveLength(3);
  });

  it("fails when the follow-up GET does not confirm deletion", async () => {
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
      { status: 200 },
      {
        status: 200,
        body: { project: { id: PROJECT_ID, name: `${RUN_MARKER} project` } },
      },
    ]);

    await expect(
      cleanupProject(project(), RUN_MARKER, transport)
    ).rejects.toThrow("Could not confirm deletion");
  });
});

describe("cleanupRegisteredResources", () => {
  it("cleans resources in reverse registration order", async () => {
    const registry = new ResourceRegistry();
    const firstId = "123e4567-e89b-42d3-a456-426614174001";
    const secondId = "123e4567-e89b-42d3-a456-426614174002";
    registry.register(project(firstId));
    registry.register(project(secondId));
    const transport = fakeTransport([
      {
        status: 200,
        body: { project: { id: secondId, name: `${RUN_MARKER} second` } },
      },
      { status: 200 },
      { status: 404 },
      {
        status: 200,
        body: { project: { id: firstId, name: `${RUN_MARKER} first` } },
      },
      { status: 200 },
      { status: 404 },
    ]);

    await cleanupRegisteredResources(registry, RUN_MARKER, transport);

    expect(registry.list()).toEqual([]);

    expect(transport.requests.map(({ path }) => path)).toEqual([
      `/api/projects/${secondId}`,
      `/api/projects/${secondId}`,
      `/api/projects/${secondId}`,
      `/api/projects/${firstId}`,
      `/api/projects/${firstId}`,
      `/api/projects/${firstId}`,
    ]);
  });

  it("refuses unknown resource kinds without making an HTTP request", async () => {
    const registry = new ResourceRegistry();
    registry.register({ kind: "user", id: "user-id", marker: RUN_MARKER });
    const transport = fakeTransport([]);

    await expect(
      cleanupRegisteredResources(registry, RUN_MARKER, transport)
    ).rejects.toThrow("Refusing to delete unknown resource kind");
    expect(transport.requests).toEqual([]);
  });

  it("aggregates failures after attempting every registered cleanup", async () => {
    const registry = new ResourceRegistry();
    const firstId = "123e4567-e89b-42d3-a456-426614174001";
    registry.register(project(firstId));
    registry.register({ kind: "unknown", id: "opaque-id", marker: RUN_MARKER });
    registry.register(project(PROJECT_ID));
    const transport = fakeTransport([
      { status: 500 },
      {
        status: 200,
        body: { project: { id: firstId, name: "Not owned" } },
      },
    ]);

    let caught: unknown;
    try {
      await cleanupRegisteredResources(registry, RUN_MARKER, transport);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(3);
    expect(registry.list()).toEqual([
      project(firstId),
      { kind: "unknown", id: "opaque-id", marker: RUN_MARKER },
      project(PROJECT_ID),
    ]);
    expect(transport.requests).toEqual([
      { method: "GET", path: `/api/projects/${PROJECT_ID}` },
      { method: "GET", path: `/api/projects/${firstId}` },
    ]);
  });

  it("continues cleanup after ownership, DELETE, and confirmation failures", async () => {
    const registry = new ResourceRegistry();
    const successId = "123e4567-e89b-42d3-a456-426614174011";
    const confirmationId = "123e4567-e89b-42d3-a456-426614174012";
    const deletionId = "123e4567-e89b-42d3-a456-426614174013";
    const ownershipId = "123e4567-e89b-42d3-a456-426614174014";
    registry.register(project(successId));
    registry.register(project(confirmationId));
    registry.register(project(deletionId));
    registry.register(project(ownershipId));
    const transport = fakeTransport([
      new Error("ownership failed"),
      {
        status: 200,
        body: { project: { id: deletionId, name: `${RUN_MARKER} delete` } },
      },
      new Error("DELETE failed"),
      {
        status: 200,
        body: {
          project: { id: confirmationId, name: `${RUN_MARKER} confirm` },
        },
      },
      { status: 200 },
      new Error("confirmation failed"),
      {
        status: 200,
        body: { project: { id: successId, name: `${RUN_MARKER} success` } },
      },
      { status: 200 },
      { status: 404 },
    ]);

    let caught: unknown;
    try {
      await cleanupRegisteredResources(registry, RUN_MARKER, transport);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(3);
    expect(registry.list()).toEqual([
      project(confirmationId),
      project(deletionId),
      project(ownershipId),
    ]);
    expect(transport.requests.map(({ path }) => path)).toEqual([
      `/api/projects/${ownershipId}`,
      `/api/projects/${deletionId}`,
      `/api/projects/${deletionId}`,
      `/api/projects/${confirmationId}`,
      `/api/projects/${confirmationId}`,
      `/api/projects/${confirmationId}`,
      `/api/projects/${successId}`,
      `/api/projects/${successId}`,
      `/api/projects/${successId}`,
    ]);
  });
});
