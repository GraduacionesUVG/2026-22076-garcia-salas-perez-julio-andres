import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import {
  createQaProjectFixture,
  type QaProjectFixture,
} from "@/__tests__/backend/project-fixture";
import {
  closeQaSessions,
  createQaSessions,
  type QaIdentity,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import { codeFixtureData } from "@/__tests__/backend/task10-test-helpers";
import {
  assignedResource,
  cleanupAfterSetupFailure,
  closeAssignedResources,
  createTask14OwnedProjectFixture,
} from "@/__tests__/integration/security/task14-test-helpers";

export const BACKEND_ROUTE_COVERAGE = [] as const;

// This checkout has no migrations or RLS policy definitions. These cases audit
// HTTP-observable isolation only and never invoke AI or export generation.

type JsonObject = Record<string, unknown>;

interface AuditProject {
  fixture: QaProjectFixture;
  request: APIRequestContext;
}

interface ChildRecord extends JsonObject {
  id: string;
  revision?: number;
}

interface ChildIsolationCase {
  family: string;
  field: string;
  responseKey: string;
  create(project: AuditProject): Promise<ChildRecord>;
  mutate(
    request: APIRequestContext,
    projectId: string,
    child: ChildRecord,
    value: string
  ): Promise<APIResponse>;
  read(project: AuditProject, childId: string): Promise<JsonObject>;
}

test.describe.serial("Task 14 project isolation audit", () => {
  test.setTimeout(180_000);

  const sessionsRef = assignedResource<QaSessions>(closeQaSessions);
  const anonymousRef = assignedResource<APIRequestContext>((value) => value.dispose());
  const primaryRef = assignedResource<QaProjectFixture>((value) => value.cleanup());
  const foreignRef = assignedResource<QaProjectFixture>((value) => value.cleanup());
  const resources = [foreignRef, primaryRef, anonymousRef, sessionsRef];
  let sequence = 0;

  const sessions = () => sessionsRef.current!;
  const primary = (): AuditProject => ({
    fixture: primaryRef.current!,
    request: sessions().owner.request,
  });
  const foreign = (): AuditProject => ({
    fixture: foreignRef.current!,
    request: sessions().intruder.request,
  });

  async function json(response: APIResponse): Promise<JsonObject> {
    const value: unknown = await response.json();
    expect(value).toEqual(expect.any(Object));
    expect(Array.isArray(value)).toBe(false);
    return value as JsonObject;
  }

  function objectField(value: JsonObject, key: string): JsonObject {
    const nested = value[key];
    expect(nested).toEqual(expect.any(Object));
    expect(Array.isArray(nested)).toBe(false);
    return nested as JsonObject;
  }

  function nextValue(label: string, project: AuditProject): string {
    sequence += 1;
    return `${project.fixture.marker} ${label} ${sequence}`;
  }

  function stableAfterMutation(resource: JsonObject): JsonObject {
    const serverManaged = new Set([
      "updated_at",
      "linked_document_count",
      "last_document_at",
    ]);
    return Object.fromEntries(
      Object.entries(resource).filter(([key]) => !serverManaged.has(key))
    );
  }

  function unchangedMutationShape(
    resource: JsonObject,
    changedField: string
  ): JsonObject {
    const expectedChanges = new Set([changedField, "revision", "updated_at"]);
    return Object.fromEntries(
      Object.entries(resource).filter(([key]) => !expectedChanges.has(key))
    );
  }

  async function closeResources(): Promise<void> {
    await closeAssignedResources(resources, "Task 14 isolation cleanup failed");
  }

  test.beforeAll(async () => {
    try {
      const qaSessions = sessionsRef.assign(await createQaSessions());
      primaryRef.assign(await createQaProjectFixture(qaSessions));
      foreignRef.assign(
        await createTask14OwnedProjectFixture(qaSessions.intruder.request)
      );
      const baseURL = process.env.BACKEND_TEST_BASE_URL ?? "http://localhost:3000";
      anonymousRef.assign(
        await playwrightRequest.newContext({
          baseURL,
          extraHTTPHeaders: { origin: new URL(baseURL).origin },
        })
      );
    } catch (error) {
      await cleanupAfterSetupFailure(
        error,
        resources,
        "Task 14 isolation setup and cleanup failed"
      );
    }
  });

  test.afterAll(closeResources);

  const readFamilies = [
    ["projects", (id: string) => `/api/projects/${id}`],
    ["collaboration", (id: string) => `/api/projects/${id}/team`],
    ["delimitation", (id: string) => `/api/projects/${id}/delimitation`],
    ["delimitation versions", (id: string) => `/api/projects/${id}/delimitation/versions`],
    ["research design", (id: string) => `/api/projects/${id}/research-design`],
    ["research design versions", (id: string) => `/api/projects/${id}/research-design/versions`],
    ["sample configuration", (id: string) => `/api/projects/${id}/sample-config`],
    ["sample options", (id: string) => `/api/projects/${id}/sample-config/options`],
    ["sample versions", (id: string) => `/api/projects/${id}/sample-config/versions`],
    ["participants", (id: string) => `/api/projects/${id}/participants`],
    ["document sources", (id: string) => `/api/projects/${id}/documents/sources`],
    ["documents", (id: string) => `/api/projects/${id}/documents`],
    ["document trash", (id: string) => `/api/projects/${id}/documents/trash`],
    ["analysis codes", (id: string) => `/api/projects/${id}/analysis/codes`],
    ["analysis memos", (id: string) => `/api/projects/${id}/analysis/memos`],
    ["analysis insights", (id: string) => `/api/projects/${id}/analysis/insights`],
    ["analysis dashboard", (id: string) => `/api/projects/${id}/analysis/dashboard`],
  ] as const;

  for (const [family, path] of readFamilies) {
    test(`${family} enforces all identities against own and foreign projects`, async () => {
      const identities: ReadonlyArray<{
        identity: QaIdentity | "anonymous";
        request: APIRequestContext;
      }> = [
        { identity: "anonymous", request: anonymousRef.current! },
        { identity: "owner", request: sessions().owner.request },
        { identity: "editor", request: sessions().editor.request },
        { identity: "viewer", request: sessions().viewer.request },
        { identity: "intruder", request: sessions().intruder.request },
      ];
      const projects = [
        {
          label: "own",
          id: primary().fixture.project.id,
          statuses: { anonymous: 401, owner: 200, editor: 200, viewer: 200, intruder: 403 },
        },
        {
          label: "foreign",
          id: foreign().fixture.project.id,
          statuses: { anonymous: 401, owner: 403, editor: 403, viewer: 403, intruder: 200 },
        },
      ] as const;

      for (const project of projects) {
        for (const identity of identities) {
          const response = await identity.request.get(path(project.id));
          expect(
            response.status(),
            `${family}: ${identity.identity} against ${project.label}`
          ).toBe(project.statuses[identity.identity]);
        }
      }
    });
  }

  const childCases: ChildIsolationCase[] = [
    {
      family: "delimitation items",
      field: "text",
      responseKey: "item",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/delimitation/items`,
          { data: { kind: "include", text: nextValue("criterion", project) } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "item") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(
          `/api/projects/${projectId}/delimitation/items/${child.id}`,
          { data: { text: value } }
        );
      },
      async read(project, childId) {
        const data = objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/delimitation`
            )
          ),
          "data"
        );
        return (data.include as JsonObject[]).find((row) => row.id === childId)!;
      },
    },
    {
      family: "research objectives",
      field: "text",
      responseKey: "objective",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/research-design/specific-objectives`,
          { data: { text: nextValue("objective", project) } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "objective") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(
          `/api/projects/${projectId}/research-design/specific-objectives/${child.id}`,
          { data: { base_revision: child.revision, text: value } }
        );
      },
      async read(project, childId) {
        const data = objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/research-design`
            )
          ),
          "data"
        );
        return (data.specific_objectives as JsonObject[]).find(
          (row) => row.id === childId
        )!;
      },
    },
    {
      family: "participants",
      field: "notes",
      responseKey: "participant",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/participants`,
          { data: { alias: nextValue("participant", project), notes: "unchanged" } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "participant") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(`/api/projects/${projectId}/participants/${child.id}`, {
          data: { notes: value },
        });
      },
      async read(project, childId) {
        return objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/participants/${childId}`
            )
          ),
          "participant"
        );
      },
    },
    {
      family: "document sources",
      field: "description",
      responseKey: "source",
      async create(project) {
        const code = `qa_${project.fixture.marker.slice(-8)}_${++sequence}`.toLowerCase();
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/documents/sources`,
          { data: { code, label: nextValue("source", project), description: "unchanged" } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "source") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(
          `/api/projects/${projectId}/documents/sources/${child.id}`,
          { data: { description: value } }
        );
      },
      async read(project, childId) {
        return objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/documents/sources/${childId}`
            )
          ),
          "source"
        );
      },
    },
    {
      family: "documents",
      field: "notes",
      responseKey: "document",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/documents`,
          { data: { title: nextValue("document", project), content: "bounded isolation fixture", notes: "unchanged" } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "document") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(`/api/projects/${projectId}/documents/${child.id}`, {
          data: { base_revision: child.revision, notes: value },
        });
      },
      async read(project, childId) {
        return objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/documents/${childId}`
            )
          ),
          "document"
        );
      },
    },
    {
      family: "analysis codes",
      field: "description",
      responseKey: "code",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/analysis/codes`,
          { data: codeFixtureData({ name: nextValue("code", project), description: "unchanged" }) }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "code") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(`/api/projects/${projectId}/analysis/codes/${child.id}`, {
          data: { base_revision: child.revision, description: value },
        });
      },
      async read(project, childId) {
        return objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/analysis/codes/${childId}`
            )
          ),
          "code"
        );
      },
    },
    {
      family: "analysis memos",
      field: "body",
      responseKey: "memo",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/analysis/memos`,
          { data: { title: nextValue("memo", project), body: "unchanged" } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "memo") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(`/api/projects/${projectId}/analysis/memos/${child.id}`, {
          data: { base_revision: child.revision, body: value },
        });
      },
      async read(project, childId) {
        return objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/analysis/memos/${childId}`
            )
          ),
          "memo"
        );
      },
    },
    {
      family: "analysis insights",
      field: "summary",
      responseKey: "insight",
      async create(project) {
        const response = await project.request.post(
          `/api/projects/${project.fixture.project.id}/analysis/insights`,
          { data: { title: nextValue("insight", project), summary: "unchanged" } }
        );
        expect(response.status()).toBe(201);
        return objectField(await json(response), "insight") as ChildRecord;
      },
      mutate(request, projectId, child, value) {
        return request.patch(`/api/projects/${projectId}/analysis/insights/${child.id}`, {
          data: { base_revision: child.revision, summary: value },
        });
      },
      async read(project, childId) {
        return objectField(
          await json(
            await project.request.get(
              `/api/projects/${project.fixture.project.id}/analysis/insights/${childId}`
            )
          ),
          "insight"
        );
      },
    },
  ];

  for (const childCase of childCases) {
    test(`${childCase.family} proves own success and foreign immutability`, async () => {
      const ownProject = primary();
      const foreignProject = foreign();
      const own = await childCase.create(ownProject);
      const foreignChild = await childCase.create(foreignProject);
      const ownBefore = await childCase.read(ownProject, own.id);
      const foreignBefore = await childCase.read(foreignProject, foreignChild.id);

      const ownValue = nextValue("own mutation", ownProject);
      const ownMutation = await childCase.mutate(
        ownProject.request,
        ownProject.fixture.project.id,
        own,
        ownValue
      );
      expect(ownMutation.status(), `${childCase.family}: own ID`).toBe(200);
      const ownResponse = objectField(await json(ownMutation), childCase.responseKey);
      const ownAfter = await childCase.read(ownProject, own.id);
      expect(ownAfter[childCase.field]).toBe(ownValue);
      expect(stableAfterMutation(ownAfter)).toEqual(stableAfterMutation(ownResponse));
      expect(unchangedMutationShape(ownAfter, childCase.field)).toEqual(
        unchangedMutationShape(ownBefore, childCase.field)
      );

      const crossed = await childCase.mutate(
        ownProject.request,
        foreignProject.fixture.project.id,
        foreignChild,
        nextValue("crossed mutation", ownProject)
      );
      expect(crossed.status(), `${childCase.family}: foreign project`).toBe(403);

      const foreignAfter = await childCase.read(foreignProject, foreignChild.id);
      expect(foreignAfter).toEqual(foreignBefore);
    });
  }
});
