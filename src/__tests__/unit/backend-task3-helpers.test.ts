import {
  request as playwrightRequest,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { ResourceRegistry } from "@/__tests__/backend/resource-registry";
import {
  bootstrapQaAccount,
  closeQaSession,
  createQaSessions,
  loginQaSession,
  type QaSession,
  type QaSessions,
} from "@/__tests__/backend/sessions";
import {
  cleanupQaProjectAndSessions,
  createQaProjectFixture,
  teamRolesByUserId,
} from "@/__tests__/backend/project-fixture";

jest.mock("@playwright/test", () => ({
  request: { newContext: jest.fn() },
}));

function response(status: number, body: Record<string, unknown>): APIResponse {
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    json: async () => body,
  } as APIResponse;
}

function scriptedContext(responses: APIResponse[]): APIRequestContext & {
  post: jest.Mock;
  dispose: jest.Mock;
} {
  return {
    post: jest.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("Unexpected request");
      return next;
    }),
    dispose: jest.fn().mockResolvedValue(undefined),
  } as unknown as APIRequestContext & {
    post: jest.Mock;
    dispose: jest.Mock;
  };
}

const loginParams = {
  identity: "owner" as const,
  email: "qa_backend_owner@example.com",
  password: "local-test-password",
};

const testConfig = {
  supabaseHost: "qa-ref.supabase.co",
  ownerEmail: "qa_backend_owner@example.com",
  editorEmail: "qa_backend_editor@example.com",
  viewerEmail: "qa_backend_viewer@example.com",
  intruderEmail: "qa_backend_intruder@example.com",
  userPassword: "local-test-password",
};

function failureMessages(error: unknown): string[] {
  if (error instanceof AggregateError) {
    return error.errors.flatMap(failureMessages);
  }
  return [error instanceof Error ? error.message : String(error)];
}

describe("Task 3 session helpers", () => {
  it("reuses an existing account without registering", async () => {
    const request = scriptedContext([
      response(200, {
        ok: true,
        user: { id: "owner-id", email: loginParams.email },
      }),
    ]);

    const session = await loginQaSession({ ...loginParams, request });

    expect(session.user.id).toBe("owner-id");
    expect(request.post).toHaveBeenCalledTimes(1);
    expect(request.post).toHaveBeenCalledWith("/api/auth/login", expect.anything());
    expect(request.post).not.toHaveBeenCalledWith(
      "/api/auth/register",
      expect.anything()
    );
  });

  it("never registers when ordinary login receives invalid credentials", async () => {
    const request = scriptedContext([
      response(401, { ok: false, error: "Invalid credentials" }),
    ]);

    await expect(
      loginQaSession({ ...loginParams, request })
    ).rejects.toThrow("owner login failed with status 401");

    expect(request.post.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
    ]);
  });

  it("bootstraps only through the explicit QA bootstrap helper", async () => {
    const request = scriptedContext([
      response(401, { ok: false, error: "Invalid credentials" }),
      response(201, { ok: true }),
      response(200, {
        ok: true,
        user: { id: "owner-id", email: loginParams.email },
      }),
    ]);

    await bootstrapQaAccount({ ...loginParams, request });

    expect(request.post.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/login",
    ]);
  });

  it.each([
    [409, "Conflict"],
    [400, "User already registered"],
  ])(
    "performs one final login when registration reports an existing account (%s)",
    async (status, error) => {
      const request = scriptedContext([
        response(401, { ok: false, error: "Invalid credentials" }),
        response(status, { ok: false, error }),
        response(200, {
          ok: true,
          user: { id: "owner-id", email: loginParams.email },
        }),
      ]);

      await bootstrapQaAccount({ ...loginParams, request });

      expect(request.post.mock.calls.map(([path]) => path)).toEqual([
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/login",
      ]);
    }
  );

  it("does not loop when the final login after a registration conflict fails", async () => {
    const request = scriptedContext([
      response(401, { ok: false, error: "Invalid credentials" }),
      response(409, { ok: false, error: "Conflict" }),
      response(401, { ok: false, error: "Invalid credentials" }),
    ]);

    await expect(
      bootstrapQaAccount({ ...loginParams, request })
    ).rejects.toThrow("owner login failed with status 401");
    expect(request.post.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/login",
    ]);
  });

  it.each([
    [500, "Server error"],
    [401, "Account disabled"],
  ])(
    "does not register after an unrelated %s login failure",
    async (status, error) => {
      const request = scriptedContext([
        response(status, { ok: false, error }),
      ]);

      await expect(
        loginQaSession({ ...loginParams, request })
      ).rejects.toThrow(`owner login failed with status ${status}`);
      expect(request.post).toHaveBeenCalledTimes(1);
      expect(request.post).not.toHaveBeenCalledWith(
        "/api/auth/register",
        expect.anything()
      );
    }
  );

  it("logs out and disposes only the selected request context", async () => {
    let ownerAuthenticated = true;
    let editorAuthenticated = true;
    const ownerRequest = scriptedContext([response(200, { ok: true })]);
    const editorRequest = scriptedContext([response(200, { ok: true })]);
    ownerRequest.post.mockImplementation(async (path: string) => {
      if (path === "/api/auth/logout") ownerAuthenticated = false;
      return response(200, { ok: true });
    });
    editorRequest.post.mockImplementation(async (path: string) => {
      if (path === "/api/auth/logout") editorAuthenticated = false;
      return response(200, { ok: true });
    });
    const owner = {
      email: "qa_backend_owner@example.com",
      request: ownerRequest,
      user: { id: "owner-id", email: "qa_backend_owner@example.com" },
    } satisfies QaSession;
    const editor = {
      email: "qa_backend_editor@example.com",
      request: editorRequest,
      user: { id: "editor-id", email: "qa_backend_editor@example.com" },
    } satisfies QaSession;

    await closeQaSession(owner);

    expect(ownerAuthenticated).toBe(false);
    expect(ownerRequest.dispose).toHaveBeenCalledTimes(1);
    expect(editorAuthenticated).toBe(true);
    expect(editorRequest.post).not.toHaveBeenCalled();
    expect(editorRequest.dispose).not.toHaveBeenCalled();

    await closeQaSession(editor);
  });

  it("preserves setup and partial-session disposal failures", async () => {
    const ownerRequest = scriptedContext([
      response(200, {
        ok: true,
        user: { id: "owner-id", email: testConfig.ownerEmail },
      }),
      response(200, { ok: true }),
    ]);
    ownerRequest.dispose.mockRejectedValue(new Error("owner dispose failed"));
    const editorRequest = scriptedContext([
      response(500, { ok: false, error: "Server error" }),
    ]);
    jest
      .mocked(playwrightRequest.newContext)
      .mockResolvedValueOnce(ownerRequest)
      .mockResolvedValueOnce(editorRequest);

    let caught: unknown;
    try {
      await createQaSessions({ config: testConfig });
    } catch (error) {
      caught = error;
    }

    expect(failureMessages(caught)).toEqual([
      "editor login failed with status 500",
      "owner dispose failed",
    ]);
  });
});

describe("Task 3 project fixture", () => {
  it("registers before malformed validation and unregisters after successful setup cleanup", async () => {
    const projectId = "123e4567-e89b-42d3-a456-426614174000";
    const registry = new ResourceRegistry();
    let createdName = "";
    let ownershipReads = 0;
    const ownerRequest = {
      post: jest.fn(async (path: string, options: { data: { name: string } }) => {
        if (path !== "/api/projects") throw new Error("Unexpected POST");
        createdName = options.data.name;
        return response(201, {
          ok: true,
          project: { id: projectId, name: 42 },
        });
      }),
      get: jest.fn(async () => {
        ownershipReads += 1;
        return ownershipReads === 1
          ? response(200, {
              project: { id: projectId, name: createdName },
            })
          : response(404, { ok: false });
      }),
      delete: jest.fn().mockResolvedValue(response(200, { ok: true })),
    } as unknown as APIRequestContext;
    const unusedRequest = {} as APIRequestContext;
    const sessions = {
      config: {
        supabaseHost: "qa-ref.supabase.co",
        ownerEmail: "qa_backend_owner@example.com",
        editorEmail: "qa_backend_editor@example.com",
        viewerEmail: "qa_backend_viewer@example.com",
        intruderEmail: "qa_backend_intruder@example.com",
        userPassword: "local-test-password",
      },
      owner: { request: ownerRequest },
      editor: { request: unusedRequest },
      viewer: { request: unusedRequest },
      intruder: { request: unusedRequest },
    } as QaSessions;

    await expect(
      createQaProjectFixture(sessions, { registry })
    ).rejects.toThrow("Project creation failed with status 201");

    expect(registry.get("project", projectId)).toBeUndefined();
    expect(ownerRequest.delete).toHaveBeenCalledWith(
      `/api/projects/${projectId}`
    );
    expect(ownershipReads).toBe(2);
  });
});

describe("Task 3 teardown and team contracts", () => {
  it("aggregates project cleanup and session close failures", async () => {
    const cleanupFailure = new Error("project cleanup failed");
    const closeFailure = new Error("owner close failed");
    const failingRequest = scriptedContext([response(200, { ok: true })]);
    failingRequest.dispose.mockRejectedValue(closeFailure);
    const healthyRequest = () => scriptedContext([response(200, { ok: true })]);
    const session = (identity: string, request: APIRequestContext): QaSession => ({
      email: `qa_backend_${identity}@example.com`,
      request,
      user: { id: `${identity}-id`, email: `qa_backend_${identity}@example.com` },
    });
    const sessions = {
      config: testConfig,
      owner: session("owner", failingRequest),
      editor: session("editor", healthyRequest()),
      viewer: session("viewer", healthyRequest()),
      intruder: session("intruder", healthyRequest()),
    } satisfies QaSessions;
    const fixture = {
      cleanup: jest.fn().mockRejectedValue(cleanupFailure),
    };

    let caught: unknown;
    try {
      await cleanupQaProjectAndSessions(fixture, sessions);
    } catch (error) {
      caught = error;
    }

    expect(failureMessages(caught)).toEqual(
      expect.arrayContaining(["project cleanup failed", "owner close failed"])
    );
    expect(fixture.cleanup).toHaveBeenCalledTimes(1);
    expect(failingRequest.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    {},
    { members: null },
    { members: [{ user_id: "user-1" }] },
    { members: [{ user_id: 42, role: "owner" }] },
    { members: [{ user_id: "user-1", role: "admin" }] },
  ])("rejects a malformed owner team response: %#", (body) => {
    expect(() => teamRolesByUserId(body)).toThrow(
      "Owner team response contract invalid"
    );
  });

  it("maps a valid owner team response by user ID", () => {
    expect(
      teamRolesByUserId({
        members: [
          { user_id: "owner-id", role: "owner" },
          { user_id: "editor-id", role: "editor" },
        ],
      })
    ).toEqual(
      new Map([
        ["owner-id", "owner"],
        ["editor-id", "editor"],
      ])
    );
  });
});
