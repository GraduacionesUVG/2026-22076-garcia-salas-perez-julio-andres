jest.mock("@/src/modules/auth/auth.service", () => ({
  loginWithEmailPassword: jest.fn(),
}));
jest.mock("@/src/modules/auth/auth.rate-limit", () => ({
  enforceAuthRateLimit: jest.fn(() => null),
}));

import { POST } from "@/app/api/auth/login/route";
import { loginWithEmailPassword } from "@/src/modules/auth/auth.service";

const input = { email: "synthetic@example.test", password: "synthetic-password" };
const request = (body: unknown) => new Request("https://app.example.test/api/auth/login", {
  method: "POST", body: JSON.stringify(body),
});

describe("strict login HTTP contract", () => {
  it("rejects unknown keys before provider login", async () => {
    const response = await POST(request({ ...input, role: "owner" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "Validation error" });
    expect(loginWithEmailPassword).not.toHaveBeenCalled();
  });

  it("retains the normal login response and provider input", async () => {
    const result = { user: { id: "synthetic-user", email: input.email }, session: null };
    jest.mocked(loginWithEmailPassword).mockResolvedValue(result as never);
    const response = await POST(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...result });
    expect(loginWithEmailPassword).toHaveBeenCalledWith(input);
  });
});
