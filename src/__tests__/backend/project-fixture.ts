import type { APIRequestContext, APIResponse } from "@playwright/test";
import { ResourceRegistry } from "@/__tests__/backend/resource-registry";
import { createRunMarker } from "@/__tests__/backend/run-id";
import {
  cleanupRegisteredResources,
  type CleanupTransport,
} from "@/__tests__/backend/safe-cleanup";
import {
  closeQaSessions,
  type QaSessions,
} from "@/__tests__/backend/sessions";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface QaProjectFixture {
  marker: string;
  project: { id: string; name: string };
  registry: ResourceRegistry;
  cleanup(): Promise<void>;
}

type TeamRole = "owner" | "editor" | "viewer";

export function teamRolesByUserId(body: unknown): Map<string, TeamRole> {
  if (
    typeof body !== "object" ||
    body === null ||
    !("members" in body) ||
    !Array.isArray(body.members)
  ) {
    throw new Error("Owner team response contract invalid");
  }

  const roles = new Map<string, TeamRole>();
  for (const member of body.members) {
    if (
      typeof member !== "object" ||
      member === null ||
      !("user_id" in member) ||
      typeof member.user_id !== "string" ||
      !("role" in member) ||
      (member.role !== "owner" &&
        member.role !== "editor" &&
        member.role !== "viewer")
    ) {
      throw new Error("Owner team response contract invalid");
    }
    roles.set(member.user_id, member.role);
  }

  return roles;
}

export async function cleanupQaProjectAndSessions(
  fixture: Pick<QaProjectFixture, "cleanup"> | undefined,
  sessions: QaSessions
): Promise<void> {
  const failures: unknown[] = [];

  try {
    await fixture?.cleanup();
  } catch (error) {
    failures.push(error);
  }

  try {
    await closeQaSessions(sessions);
  } catch (error) {
    failures.push(error);
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Project cleanup and QA session close both failed"
    );
  }
}

async function jsonBody(response: APIResponse): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}

function apiError(body: Record<string, unknown>): string {
  return typeof body.error === "string" ? `: ${body.error}` : "";
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

async function inviteAndAccept(params: {
  ownerRequest: APIRequestContext;
  memberRequest: APIRequestContext;
  projectId: string;
  email: string;
  role: "editor" | "viewer";
}): Promise<void> {
  const invitationResponse = await params.ownerRequest.post(
    `/api/projects/${params.projectId}/team`,
    { data: { email: params.email, role: params.role } }
  );
  const invitationBody = await jsonBody(invitationResponse);
  const invitation = invitationBody.invitation;

  if (
    invitationResponse.status() !== 201 ||
    invitationBody.ok !== true ||
    typeof invitation !== "object" ||
    invitation === null ||
    !("token" in invitation) ||
    typeof invitation.token !== "string"
  ) {
    throw new Error(
      `${params.role} invitation failed with status ${invitationResponse.status()}${apiError(invitationBody)}`
    );
  }

  const acceptanceResponse = await params.memberRequest.post(
    "/api/project-invitations/accept",
    { data: { token: invitation.token } }
  );
  const acceptanceBody = await jsonBody(acceptanceResponse);

  if (!acceptanceResponse.ok() || acceptanceBody.ok !== true) {
    throw new Error(
      `${params.role} invitation acceptance failed with status ${acceptanceResponse.status()}${apiError(acceptanceBody)}`
    );
  }
}

export async function createQaProjectFixture(
  sessions: QaSessions,
  options: { registry?: ResourceRegistry } = {}
): Promise<QaProjectFixture> {
  const marker = createRunMarker();
  const name = `${marker} reusable role fixture`;
  const registry = options.registry ?? new ResourceRegistry();
  const transport = cleanupTransport(sessions.owner.request);
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    await cleanupRegisteredResources(registry, marker, transport);
    cleaned = true;
  };

  const response = await sessions.owner.request.post("/api/projects", {
    data: { name, description: "Reusable backend QA role fixture" },
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
      throw new Error(`Project creation failed with status ${response.status()}`);
    }

    const fixtureProject = { id: project.id, name };
    await inviteAndAccept({
      ownerRequest: sessions.owner.request,
      memberRequest: sessions.editor.request,
      projectId: fixtureProject.id,
      email: sessions.config.editorEmail,
      role: "editor",
    });
    await inviteAndAccept({
      ownerRequest: sessions.owner.request,
      memberRequest: sessions.viewer.request,
      projectId: fixtureProject.id,
      email: sessions.config.viewerEmail,
      role: "viewer",
    });

    return { marker, project: fixtureProject, registry, cleanup };
  } catch (setupError) {
    try {
      await cleanup();
    } catch (cleanupError) {
      throw new AggregateError(
        [setupError, cleanupError],
        "Project fixture setup and cleanup both failed"
      );
    }
    throw setupError;
  }
}
