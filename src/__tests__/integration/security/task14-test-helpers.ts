import type { APIRequestContext, APIResponse } from "@playwright/test";
import { ResourceRegistry } from "@/__tests__/backend/resource-registry";
import { createRunMarker } from "@/__tests__/backend/run-id";
import {
  cleanupRegisteredResources,
  type CleanupTransport,
} from "@/__tests__/backend/safe-cleanup";
import type { QaProjectFixture } from "@/__tests__/backend/project-fixture";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appendFailure(failures: unknown[], error: unknown): void {
  if (error instanceof AggregateError) {
    for (const nested of error.errors) appendFailure(failures, nested);
    return;
  }
  failures.push(error);
}

export interface AssignedResource<T> {
  current: T | undefined;
  assign(value: T): T;
  close(): Promise<void>;
}

export function assignedResource<T>(
  closeValue: (value: T) => Promise<void>
): AssignedResource<T> {
  return {
    current: undefined,
    assign(value) {
      if (this.current !== undefined) {
        throw new Error("Task 14 resource is already assigned");
      }
      this.current = value;
      return value;
    },
    async close() {
      const value = this.current;
      if (value !== undefined) {
        await closeValue(value);
        this.current = undefined;
      }
    },
  };
}

export async function closeAssignedResources(
  resources: ReadonlyArray<Pick<AssignedResource<unknown>, "close">>,
  message: string
): Promise<void> {
  const failures: unknown[] = [];
  for (const resource of resources) {
    try {
      await resource.close();
    } catch (error) {
      appendFailure(failures, error);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, message);
}

export async function cleanupAfterSetupFailure(
  setupError: unknown,
  resources: ReadonlyArray<Pick<AssignedResource<unknown>, "close">>,
  message: string
): Promise<never> {
  try {
    await closeAssignedResources(resources, message);
  } catch (cleanupError) {
    const failures = [setupError];
    appendFailure(failures, cleanupError);
    throw new AggregateError(failures, message);
  }
  throw setupError;
}

async function jsonBody(response: APIResponse): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function cleanupTransport(request: APIRequestContext): CleanupTransport {
  return {
    async request(input) {
      const response =
        input.method === "GET"
          ? await request.get(input.path)
          : await request.delete(input.path);
      return {
        status: response.status(),
        body: await response.json().catch(() => undefined),
      };
    },
  };
}

export async function createTask14OwnedProjectFixture(
  ownerRequest: APIRequestContext
): Promise<QaProjectFixture> {
  const marker = createRunMarker();
  const name = `${marker} isolated intruder fixture`;
  const registry = new ResourceRegistry();
  const transport = cleanupTransport(ownerRequest);
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    await cleanupRegisteredResources(registry, marker, transport);
    closed = true;
  };

  const response = await ownerRequest.post("/api/projects", {
    data: { name, description: "Task 14 isolated ownership fixture" },
  });
  const body = await jsonBody(response);
  const project = body.project;
  if (
    typeof project === "object" &&
    project !== null &&
    "id" in project &&
    typeof project.id === "string" &&
    UUID_PATTERN.test(project.id)
  ) {
    registry.register({ kind: "project", id: project.id, marker });
  }

  try {
    if (
      response.status() !== 201 ||
      body.ok !== true ||
      typeof project !== "object" ||
      project === null ||
      !("id" in project) ||
      typeof project.id !== "string" ||
      !UUID_PATTERN.test(project.id) ||
      !("name" in project) ||
      project.name !== name
    ) {
      throw new Error(`Task 14 project creation failed with status ${response.status()}`);
    }
    return {
      marker,
      project: { id: project.id, name },
      registry,
      cleanup,
    };
  } catch (setupError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        "Task 14 project setup and cleanup failed"
      );
    }
    throw setupError;
  }
}
