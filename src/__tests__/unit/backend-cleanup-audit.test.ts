import { strictE2eResidues } from "@/__tests__/backend/cleanup-audit";

describe("strict E2E cleanup audit", () => {
  it("lists only complete strict markers from owner and intruder project lists", () => {
    const marker = "E2E_20260712T030405_123e4567-e89b-42d3-a456-426614174000";
    expect(
      strictE2eResidues({
        owner: { projects: [
          { id: "owner-residue", name: `${marker} lifecycle` },
          { id: "near-miss", name: `${marker}_suffix lifecycle` },
          { id: "ordinary", name: "E2E planning" },
        ] },
        intruder: { projects: [{ id: "intruder-residue", name: `${marker} foreign` }] },
      })
    ).toEqual([
      { identity: "owner", id: "owner-residue", name: `${marker} lifecycle` },
      { identity: "intruder", id: "intruder-residue", name: `${marker} foreign` },
    ]);
  });

  it("fails closed on malformed list responses", () => {
    expect(() => strictE2eResidues({ owner: {}, intruder: { projects: [] } })).toThrow(
      "owner project list contract invalid"
    );
  });
});
