import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";

const getProfileById = jest.fn();
const saveOwnProfile = jest.fn();

jest.mock("@/src/modules/users/users.repo", () => ({
  UsersRepo: jest.fn().mockImplementation(() => ({
    getProfileById,
    saveOwnProfile,
  })),
}));

import { getMe } from "@/src/modules/users/users.service";

const user = {
  id: "user-1",
  email: "user@example.com",
};

describe("users service dependency failures", () => {
  beforeEach(() => {
    getProfileById.mockReset();
    saveOwnProfile.mockReset();
  });

  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name while loading the current profile",
    async (failureCase) => {
      getProfileById.mockRejectedValue(freshProviderFailure(failureCase));

      const observed = await captureRejection(
        getMe({ supabase: {} as never, user })
      );

      expectSafeDependencyFailure(observed, failureCase);
      expect(saveOwnProfile).not.toHaveBeenCalled();
    }
  );

  it("preserves an authenticated user when no optional profile row exists", async () => {
    getProfileById.mockResolvedValue(null);

    await expect(getMe({ supabase: {} as never, user })).resolves.toEqual({
      user,
      profile: null,
    });
    expect(saveOwnProfile).not.toHaveBeenCalled();
  });
});
