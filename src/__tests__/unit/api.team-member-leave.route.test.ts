import { DELETE, PATCH } from "@/app/api/projects/[id]/team/members/[userId]/route";
import { requireSession } from "@/src/modules/auth/auth.guard";

jest.mock("@/src/modules/auth/auth.guard", () => ({ requireSession: jest.fn() }));

const project = "00000000-0000-4000-8000-000000000001";
const actor = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";

function session(role: string | null, error: unknown = null) {
  const query = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: role ? { project_id: project, user_id: actor, role } : null, error: null }),
  };
  const rpc = jest.fn().mockResolvedValue({ data: null, error });
  (requireSession as jest.Mock).mockResolvedValue({ user: { id: actor }, supabase: { from: () => query, rpc } });
  return rpc;
}

describe("team member DELETE authorization through the real guard/service/repo", () => {
  it.each(["editor", "viewer", "owner"])("allows %s's permitted removal", async (role) => {
    const rpc = session(role);
    const target = role === "owner" ? other : actor;
    const response = await DELETE(new Request("http://local.test"), { params: Promise.resolve({ id: project, userId: target }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("remove_project_member_atomic", { p_project_id: project, p_user_id: target, p_actor_user_id: actor });
  });

  it.each(["editor", "viewer", null])("denies %s removing another member before writing", async (role) => {
    const rpc = session(role);
    const response = await DELETE(new Request("http://local.test"), { params: Promise.resolve({ id: project, userId: other }) });
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("denies unauthenticated removal", async () => {
    (requireSession as jest.Mock).mockRejectedValue(Object.assign(new Error("UNAUTHORIZED"), { status: 401 }));
    expect((await DELETE(new Request("http://local.test"), { params: Promise.resolve({ id: project, userId: actor }) })).status).toBe(401);
  });

  it("preserves owner self protection", async () => {
    session("owner", { code: "P0001", message: "CANNOT_REMOVE_SELF" });
    const response = await DELETE(new Request("http://local.test"), { params: Promise.resolve({ id: project, userId: actor }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "CANNOT_REMOVE_SELF" });
  });

  it.each(["editor", "viewer"])("keeps PATCH owner-only for %s", async (role) => {
    const rpc = session(role);
    const response = await PATCH(new Request("http://local.test", { method: "PATCH", body: JSON.stringify({ role: "viewer" }) }), { params: Promise.resolve({ id: project, userId: other }) });
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
