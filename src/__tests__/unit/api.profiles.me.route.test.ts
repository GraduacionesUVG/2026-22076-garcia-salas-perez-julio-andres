import { GET, PATCH } from "@/app/api/profiles/me/route";

describe('profile schema and safe dependency boundaries', () => {
  beforeEach(() => jest.resetAllMocks());
  it('rejects unknown fields without updating profile', async () => {
    (requireSession as jest.Mock).mockResolvedValue({ supabase: {}, user: { id: 'profile-actor' } });
    const response = await PATCH(new Request('http://localhost/api', { method: 'PATCH', body: JSON.stringify({ full_name: 'Name', role: 'admin' }) }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: 'Validation error', details: { formErrors: ["Unrecognized key(s) in object: 'role'"], fieldErrors: {} } }); expect(updateMyProfile).not.toHaveBeenCalled();
  });
  it('redacts transport errors from profile mutation', async () => {
    (requireSession as jest.Mock).mockResolvedValue({ supabase: {}, user: { id: 'profile-actor' } });
    (updateMyProfile as jest.Mock).mockRejectedValue({ code: 'ECONNRESET', message: 'private host' });
    const response = await PATCH(new Request('http://localhost/api', { method: 'PATCH', body: '{"full_name":"  Ángela  "}' }));
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, error: 'DEPENDENCY_UNAVAILABLE' }); expect(updateMyProfile).toHaveBeenCalledWith({ supabase: {}, user: { id: 'profile-actor' }, input: { full_name: 'Ángela' } });
  });
});

jest.mock("@/src/modules/auth/auth.guard", () => ({
  requireSession: jest.fn(),
}));

jest.mock("@/src/modules/users/users.service", () => ({
  getMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
}));

import { requireSession } from "@/src/modules/auth/auth.guard";
import {
  getMyProfile,
  updateMyProfile,
} from "@/src/modules/users/users.service";

describe("GET /api/profiles/me", () => {
  it("401 when unauthorized", async () => {
    (requireSession as jest.Mock).mockRejectedValue(
      Object.assign(new Error("UNAUTHORIZED"), { status: 401 })
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
  });

  it("200 returns profile", async () => {
    (requireSession as jest.Mock).mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
      supabase: {},
    });

    (getMyProfile as jest.Mock).mockResolvedValue({
      id: "u1",
      full_name: null,
      role: "user",
      created_at: "now",
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile.id).toBe("u1");
  });
});

describe("PATCH /api/profiles/me", () => {
  it("400 when invalid JSON", async () => {
    (requireSession as jest.Mock).mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
      supabase: {},
    });

    const badReq = {
      json: async () => {
        throw new Error("bad");
      },
    } as unknown as Request;

    const res = await PATCH(badReq);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("200 updates full_name", async () => {
    (requireSession as jest.Mock).mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
      supabase: {},
    });

    (updateMyProfile as jest.Mock).mockResolvedValue({
      id: "u1",
      full_name: "Sofi",
      role: "user",
      created_at: "now",
    });

    const req = new Request('http://localhost/api', { method: 'PATCH', body: '{"full_name":"Sofi"}' });

    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.profile.full_name).toBe("Sofi");
  });
});
