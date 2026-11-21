import { GET } from "@/app/api/auth/me/route";

jest.mock("@/src/modules/auth/auth.guard", () => ({
  requireSession: jest.fn(),
}));

import { requireSession } from "@/src/modules/auth/auth.guard";

describe("GET /api/auth/me", () => {
  it("401 when unauthorized", async () => {
    (requireSession as jest.Mock).mockRejectedValue(Object.assign(new Error("UNAUTHORIZED"), { status: 401 }));

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("UNAUTHORIZED");
  });

  it("200 returns user", async () => {
    (requireSession as jest.Mock).mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
    });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.user).toEqual({ id: "u1", email: "a@b.com" });
  });
});
