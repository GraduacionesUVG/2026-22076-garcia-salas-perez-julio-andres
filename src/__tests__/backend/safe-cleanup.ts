import {
  ResourceRegistry,
  type ResourceRecord,
} from "@/__tests__/backend/resource-registry";

export interface CleanupTransportRequest {
  method: "GET" | "DELETE";
  path: string;
}

export interface CleanupTransportResponse {
  status: number;
  body?: unknown;
}

export interface CleanupTransport {
  request(
    request: CleanupTransportRequest
  ): Promise<CleanupTransportResponse>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_MARKER_PATTERN =
  /^E2E_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

function isValidRunMarker(marker: string): boolean {
  const match = RUN_MARKER_PATTERN.exec(marker);
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second] = match;
  const timestamp = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );

  return (
    timestamp.getUTCFullYear() === Number(year) &&
    timestamp.getUTCMonth() === Number(month) - 1 &&
    timestamp.getUTCDate() === Number(day) &&
    timestamp.getUTCHours() === Number(hour) &&
    timestamp.getUTCMinutes() === Number(minute) &&
    timestamp.getUTCSeconds() === Number(second)
  );
}

function unownedResourceError(
  resource: ResourceRecord,
  cause?: unknown
): Error {
  return new Error(
    `Refusing to delete unowned resource: ${resource.kind} ${resource.id}`,
    cause === undefined ? undefined : { cause }
  );
}

function ownedProject(
  response: CleanupTransportResponse
): { id: string; name: string } | null {
  if (
    response.status !== 200 ||
    typeof response.body !== "object" ||
    response.body === null ||
    !("project" in response.body)
  ) {
    return null;
  }

  const project = response.body.project;
  if (
    typeof project !== "object" ||
    project === null ||
    !("id" in project) ||
    !("name" in project) ||
    typeof project.id !== "string" ||
    typeof project.name !== "string"
  ) {
    return null;
  }

  return { id: project.id, name: project.name };
}

function projectIsAbsentFromOwnerList(
  response: CleanupTransportResponse,
  projectId: string
): boolean {
  if (
    response.status !== 200 ||
    typeof response.body !== "object" ||
    response.body === null ||
    !("projects" in response.body) ||
    !Array.isArray(response.body.projects)
  ) {
    return false;
  }

  return !response.body.projects.some(
    (project) =>
      typeof project === "object" &&
      project !== null &&
      "id" in project &&
      project.id === projectId
  );
}

export async function cleanupProject(
  resource: ResourceRecord,
  runMarker: string,
  transport: CleanupTransport
): Promise<void> {
  if (
    resource.kind !== "project" ||
    resource.marker !== runMarker ||
    !isValidRunMarker(runMarker) ||
    !UUID_PATTERN.test(resource.id)
  ) {
    throw unownedResourceError(resource);
  }

  const path = `/api/projects/${resource.id}`;
  let ownershipResponse: CleanupTransportResponse;
  try {
    ownershipResponse = await transport.request({ method: "GET", path });
  } catch (error) {
    throw unownedResourceError(resource, error);
  }
  const project = ownedProject(ownershipResponse);

  if (project?.id !== resource.id || !project.name.startsWith(runMarker)) {
    throw unownedResourceError(resource);
  }

  const deletionResponse = await transport.request({ method: "DELETE", path });
  if (
    !Number.isInteger(deletionResponse.status) ||
    deletionResponse.status < 200 ||
    deletionResponse.status >= 300
  ) {
    throw new Error(`Project deletion failed: ${resource.id}`);
  }

  const confirmationResponse = await transport.request({ method: "GET", path });
  if (confirmationResponse.status === 404) return;

  if (confirmationResponse.status === 403) {
    const documentedDeletion =
      typeof deletionResponse.body === "object" &&
      deletionResponse.body !== null &&
      "ok" in deletionResponse.body &&
      deletionResponse.body.ok === true;
    const ownerListResponse = await transport.request({
      method: "GET",
      path: "/api/projects",
    });
    if (
      documentedDeletion &&
      projectIsAbsentFromOwnerList(ownerListResponse, resource.id)
    ) {
      return;
    }
  }

  throw new Error(`Could not confirm deletion: ${resource.id}`);
}

export async function cleanupRegisteredResources(
  registry: ResourceRegistry,
  runMarker: string,
  transport: CleanupTransport
): Promise<void> {
  const failures: unknown[] = [];

  for (const resource of [...registry.list()].reverse()) {
    try {
      if (resource.kind !== "project") {
        throw new Error(
          `Refusing to delete unknown resource kind: ${resource.kind}`
        );
      }

      await cleanupProject(resource, runMarker, transport);
      registry.unregister(resource.kind, resource.id);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    const messages = failures.map((failure) =>
      failure instanceof Error ? failure.message : String(failure)
    );
    throw new AggregateError(failures, messages.join("; "));
  }
}
