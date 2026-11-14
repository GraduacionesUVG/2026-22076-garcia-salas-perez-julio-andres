import { requireProjectMember, requireProjectRole } from "@/src/modules/projects/project.guard";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';
import { SUPABASE_FAILURE_CASES, freshProviderFailure } from "@/__tests__/backend/supabase-failure-cases";

jest.mock("@/src/modules/auth/auth.guard", () => ({ requireSession: jest.fn() }));

function query(result: unknown, thrown = false) {
  const terminal = thrown ? Promise.reject(result) : Promise.resolve(result);
  const builder = { select: () => builder, eq: () => builder, maybeSingle: () => terminal };
  const supabase = { from: jest.fn(() => builder) };
  (requireSession as jest.Mock).mockResolvedValue({ supabase, user: { id: "user-1" } });
  return supabase;
}

describe("project membership dependency boundary", () => {
  it.each(['owner','editor','viewer'] as const)('uses project AND actor SDK predicates for %s',async role=>{
    const member={project_id:'project-1',user_id:'actor',role}; const db=createRecordedSupabase([{status:200,body:member}]);
    jest.mocked(requireSession).mockResolvedValue({supabase:db.client,user:{id:'actor',email:null}} as never);
    await expect(requireProjectRole('project-1',[role])).resolves.toMatchObject({member});
    expect(db.requests[0].url.searchParams.get('project_id')).toBe('eq.project-1'); expect(db.requests[0].url.searchParams.get('user_id')).toBe('eq.actor'); expect(db.requests[0].method).toBe('GET'); db.assertDrained();
  });
  it.each(SUPABASE_FAILURE_CASES)("redacts returned $name instead of denying membership", async (fixture) => {
    query({ data: null, error: freshProviderFailure(fixture) });
    await expect(requireProjectMember("project-1")).rejects.toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
  });
  it.each(SUPABASE_FAILURE_CASES)("redacts thrown $name", async (fixture) => {
    query(freshProviderFailure(fixture), true);
    await expect(requireProjectMember("project-1")).rejects.toMatchObject({ status: 503, message: "DEPENDENCY_UNAVAILABLE" });
  });
  it("retains absent membership and role denial as 403", async () => {
    query({ data: null, error: null });
    await expect(requireProjectMember("project-1")).rejects.toMatchObject({ status: 403 });
    query({ data: { project_id: "project-1", user_id: "user-1", role: "viewer" }, error: null });
    await expect(requireProjectRole("project-1", ["owner"])).rejects.toMatchObject({ status: 403 });
  });
  it("retains authentication 401 before querying membership", async () => {
    const supabase = query({ data: null, error: null });
    const error = Object.assign(new Error("UNAUTHORIZED"), { status: 401 });
    (requireSession as jest.Mock).mockRejectedValue(error);
    await expect(requireProjectMember("project-1")).rejects.toBe(error);
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it("returns successful membership unchanged", async () => {
    const member = { project_id: "project-1", user_id: "user-1", role: "editor" };
    query({ data: member, error: null });
    await expect(requireProjectRole("project-1", ["editor"])).resolves.toMatchObject({ member });
  });
  it("retains safe forbidden for nontransient membership query failures", async () => {
    const error = { code: "42501", message: "permission denied" };
    query({ data: null, error });
    await expect(requireProjectMember("project-1")).rejects.toMatchObject({ status: 403, message: "FORBIDDEN" });
  });
});
