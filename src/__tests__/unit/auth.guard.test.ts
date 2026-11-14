import { getOptionalSession, requireSession } from "@/src/modules/auth/auth.guard";

// mock del supabaseServer (tu factory)
jest.mock("@/src/lib/supabase/server", () => ({
  supabaseServer: jest.fn(),
}));

import { supabaseServer } from "@/src/lib/supabase/server";

describe("requireSession", () => {
  it('does not accept returned auth errors even alongside a user', async () => {
    const supabase={auth:{getUser:jest.fn().mockResolvedValue({data:{user:{id:'u1'}},error:{message:'expired'}})}};
    (supabaseServer as jest.Mock).mockResolvedValue(supabase);
    await expect(getOptionalSession()).resolves.toEqual({supabase,user:null});
    await expect(requireSession()).rejects.toMatchObject({message:'UNAUTHORIZED',status:401});
  });
  it('normalizes absent email and ignores provider-only user fields',async()=>{
    const supabase={auth:{getUser:jest.fn().mockResolvedValue({data:{user:{id:'u1',secret:'private'}},error:null})}};
    (supabaseServer as jest.Mock).mockResolvedValue(supabase);
    await expect(getOptionalSession()).resolves.toEqual({supabase,user:{id:'u1',email:null}});
  });
  it("throws UNAUTHORIZED when no user", async () => {
    (supabaseServer as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    await expect(requireSession()).rejects.toMatchObject({
      message: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("returns user and supabase when session exists", async () => {
    (supabaseServer as jest.Mock).mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "u1", email: "a@b.com" } },
          error: null,
        }),
      },
    });

    const { user, supabase } = await requireSession();

    expect(user).toEqual({ id: "u1", email: "a@b.com" });
    expect(supabase).toBeTruthy();
  });
});
