import { buildDocumentSearchFilter } from "@/src/modules/documents/documents.repo";

describe("document search helpers", () => {
  it("builds an archival search filter across title, content, notes and location", () => {
    expect(buildDocumentSearchFilter("  aprendizaje, datos  ")).toBe(
      "title.ilike.%aprendizaje datos%,content.ilike.%aprendizaje datos%,notes.ilike.%aprendizaje datos%,location.ilike.%aprendizaje datos%"
    );
  });

  it("returns null when search is empty after normalization", () => {
    expect(buildDocumentSearchFilter(" ,   ")).toBeNull();
  });
});
