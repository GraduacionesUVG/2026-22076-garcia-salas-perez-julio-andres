const STRICT_MARKED_PROJECT =
  /^E2E_\d{8}T\d{6}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} /;

type Identity = "owner" | "intruder";

export interface CleanupAuditResidue {
  identity: Identity;
  id: string;
  name: string;
}

function projectsFromList(identity: Identity, body: unknown): unknown[] {
  if (
    typeof body !== "object" ||
    body === null ||
    !("projects" in body) ||
    !Array.isArray(body.projects)
  ) {
    throw new Error(`${identity} project list contract invalid`);
  }
  return body.projects;
}

export function strictE2eResidues(input: {
  owner: unknown;
  intruder: unknown;
}): CleanupAuditResidue[] {
  const residues: CleanupAuditResidue[] = [];
  for (const identity of ["owner", "intruder"] as const) {
    for (const project of projectsFromList(identity, input[identity])) {
      if (
        typeof project === "object" &&
        project !== null &&
        "id" in project &&
        "name" in project &&
        typeof project.id === "string" &&
        typeof project.name === "string" &&
        STRICT_MARKED_PROJECT.test(project.name)
      ) {
        residues.push({ identity, id: project.id, name: project.name });
      }
    }
  }
  return residues;
}
