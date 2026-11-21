jest.mock("@/src/modules/auth/auth.guard", () => ({
  requireSession: jest.fn(),
}));

jest.mock("@/src/modules/users/users.service", () => ({
  getMe: jest.fn(),
  getMyProfile: jest.fn(),
}));

import { GET as getProfile } from "@/app/api/profiles/me/route";
import { GET as getUser } from "@/app/api/users/me/route";
import { requireSession } from "@/src/modules/auth/auth.guard";
import { getMe, getMyProfile } from "@/src/modules/users/users.service";

const user = { id: "qa-owner", email: "qa_backend_owner@example.test" };

describe("null and inactive profile route contracts", () => {
  beforeEach(() => {
    (requireSession as jest.Mock).mockResolvedValue({ user, supabase: {} });
  });

  it("returns the canonical authenticated identity with a null profile", async () => {
    (getMe as jest.Mock).mockResolvedValue({ user, profile: null });

    const response = await getUser();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, user, profile: null });
  });

  it("keeps the compatibility route null-profile shape", async () => {
    (getMyProfile as jest.Mock).mockResolvedValue(null);

    const response = await getProfile();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, profile: null });
  });

  it.each([
    ["canonical", getUser, getMe],
    ["compatibility", getProfile, getMyProfile],
  ] as const)(
    "returns a stable 403 for an inactive %s profile",
    async (_name, route, service) => {
      (service as jest.Mock).mockRejectedValue(
        Object.assign(new Error("ACCOUNT_INACTIVE"), { status: 403 })
      );

      const response = await route();

      expect(response.status).toBe(403);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({
        ok: false,
        error: "ACCOUNT_INACTIVE",
      });
    }
  );
});
