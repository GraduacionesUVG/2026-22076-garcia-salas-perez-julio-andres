import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  DATABASE_BEHAVIORAL_EVIDENCE_SCOPE,
  EXPECTED_MIGRATION_VERSIONS,
  REQUIRED_DATABASE_FOREIGN_KEYS,
  REQUIRED_DATABASE_FUNCTIONS,
  REQUIRED_DATABASE_INDEXES,
  REQUIRED_DATABASE_POLICIES,
  REQUIRED_DATABASE_TRIGGERS,
  databaseTargetHash,
  validateDatabaseEvidence,
  validateDatabaseEvidenceTarget,
} from "@/__tests__/backend/database-evidence";

const expectedHash = "a".repeat(64);

function presentEvidence(overrides: Record<string, unknown> = {}) {
  return {
    state: "present",
    issues: [],
    transactionReadOnly: true,
    roleSuperuser: false,
    roleBypassRls: false,
    migrationsHash: expectedHash,
    targetEnvironmentHash: "c".repeat(64),
    targetDatabase: "postgres",
    behavioralEvidence: {
      ...DATABASE_BEHAVIORAL_EVIDENCE_SCOPE,
      requiredContracts: [...DATABASE_BEHAVIORAL_EVIDENCE_SCOPE.requiredContracts],
    },
    expectedMigrationVersions: [...EXPECTED_MIGRATION_VERSIONS],
    appliedMigrations: [...EXPECTED_MIGRATION_VERSIONS],
    requiredFunctions: REQUIRED_DATABASE_FUNCTIONS.map((item) => ({ ...item })),
    requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) => ({
      ...item,
      columns: [...item.columns],
      includedColumns: [...item.includedColumns],
    })),
    requiredTriggers: REQUIRED_DATABASE_TRIGGERS.map((item) => ({ ...item })),
    foreignKeys: REQUIRED_DATABASE_FOREIGN_KEYS.map((item) => ({
      ...item,
      columns: [...item.columns],
      referencedColumns: [...item.referencedColumns],
    })),
    policies: REQUIRED_DATABASE_POLICIES.map((item) => ({ ...item, roles: [...item.roles] })),
    ...overrides,
  };
}

describe("database evidence validation", () => {
  it("accepts least-privileged read-only evidence for the current migration hash", () => {
    expect(validateDatabaseEvidence(presentEvidence(), expectedHash)).toEqual({
      state: "present",
      issues: [],
    });
  });

  it.each([
    [{ transactionReadOnly: false }, "read-only"],
    [{ roleSuperuser: true }, "superuser"],
    [{ roleBypassRls: true }, "bypass RLS"],
    [{ migrationsHash: "b".repeat(64) }, "migration hash"],
    [{ requiredFunctions: [] }, "get_project_analysis_overview"],
    [{ requiredIndexes: [] }, "project_members_user_id_project_id_idx"],
    [{ requiredTriggers: [] }, "prevent_project_code_cycle"],
    [{ foreignKeys: [] }, "project_members"],
    [{ policies: [] }, "project_documents"],
    [{ behavioralEvidence: undefined }, "behavioral evidence scope"],
  ])("rejects unsafe or incomplete present evidence %#", (override, diagnostic) => {
    const result = validateDatabaseEvidence(presentEvidence(override), expectedHash);

    expect(result.state).toBe("invalid");
    expect(result.issues.join(" ")).toContain(diagnostic);
  });

  it.each([null, [], "not-json", { state: "present" }])(
    "rejects malformed evidence %#",
    (value) => {
      expect(validateDatabaseEvidence(value, expectedHash).state).toBe("invalid");
    }
  );

  it("keeps an absent read-only database URL explicitly not demonstrated", () => {
    expect(
      validateDatabaseEvidence(
        {
          state: "not-demonstrated",
          issues: ["TEST_DATABASE_READONLY_URL is not configured."],
          migrationsHash: expectedHash,
        },
        expectedHash
      )
    ).toEqual({
      state: "not-demonstrated",
      issues: ["TEST_DATABASE_READONLY_URL is not configured."],
    });
  });

  it("does not let an invalid expected hash turn evidence green", () => {
    const result = validateDatabaseEvidence(presentEvidence(), "not-a-hash");

    expect(result.state).toBe("invalid");
    expect(result.issues.join(" ")).toContain("Expected migration hash");
  });

  it("requires the exact sorted local migration version set", () => {
    const missing = validateDatabaseEvidence(
      presentEvidence({ appliedMigrations: EXPECTED_MIGRATION_VERSIONS.slice(1) }),
      expectedHash
    );
    const unexpected = validateDatabaseEvidence(
      presentEvidence({
        appliedMigrations: [...EXPECTED_MIGRATION_VERSIONS, "20990101000000"],
      }),
      expectedHash
    );
    const staleExpectation = validateDatabaseEvidence(
      presentEvidence({ expectedMigrationVersions: EXPECTED_MIGRATION_VERSIONS.slice(0, -1) }),
      expectedHash
    );

    expect(missing).toMatchObject({ state: "invalid" });
    expect(missing.issues.join(" ")).toContain(EXPECTED_MIGRATION_VERSIONS[0]);
    expect(unexpected.issues.join(" ")).toContain("20990101000000");
    expect(staleExpectation.issues.join(" ")).toContain("expected migration versions");
  });

  it("rejects a required RPC with the wrong identity signature", () => {
    const functions = REQUIRED_DATABASE_FUNCTIONS.map((item) =>
      item.name === "get_project_analysis_overview"
        ? { ...item, identityArguments: "input_project_id text" }
        : { ...item }
    );
    const result = validateDatabaseEvidence(
      presentEvidence({ requiredFunctions: functions }),
      expectedHash
    );

    expect(result.state).toBe("invalid");
    expect(result.issues.join(" ")).toContain("get_project_analysis_overview");
    expect(result.issues.join(" ")).toContain("input_project_id uuid");
  });

  it.each([
    [
      "an index with the right name but wrong ordered columns",
      {
        requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) =>
          item.name === "project_members_user_id_project_id_idx"
            ? { ...item, columns: ["created_at"] }
            : { ...item, columns: [...item.columns] }
        ),
      },
      "project_members_user_id_project_id_idx",
    ],
    [
      "an index with an unexpected predicate",
      {
        requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) =>
          item.name === "project_members_user_id_project_id_idx"
            ? { ...item, predicate: "deleted_at IS NULL", columns: [...item.columns] }
            : { ...item, columns: [...item.columns] }
        ),
      },
      "predicate",
    ],
    [
      "an index with an unexpected included column",
      {
        requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) =>
          item.name === "project_members_user_id_project_id_idx"
            ? { ...item, columns: [...item.columns], includedColumns: ["created_at"] }
            : { ...item, columns: [...item.columns], includedColumns: [...item.includedColumns] }
        ),
      },
      "included columns",
    ],
    [
      "an index with the wrong uniqueness",
      {
        requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) =>
          item.name === "project_members_user_id_project_id_idx"
            ? { ...item, unique: true, columns: [...item.columns] }
            : { ...item, columns: [...item.columns] }
        ),
      },
      "unique",
    ],
    [
      "an index using the wrong access method",
      {
        requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) =>
          item.name === "project_members_user_id_project_id_idx"
            ? { ...item, method: "hash", columns: [...item.columns] }
            : { ...item, columns: [...item.columns] }
        ),
      },
      "method",
    ],
    [
      "an index that is not valid and ready",
      {
        requiredIndexes: REQUIRED_DATABASE_INDEXES.map((item) =>
          item.name === "project_members_user_id_project_id_idx"
            ? { ...item, valid: false, ready: false, columns: [...item.columns] }
            : { ...item, columns: [...item.columns] }
        ),
      },
      "validity",
    ],
    [
      "a disabled trigger",
      {
        requiredTriggers: REQUIRED_DATABASE_TRIGGERS.map((item) =>
          item.name === "prevent_project_code_cycle"
            ? { ...item, enabled: "D" }
            : { ...item }
        ),
      },
      "enabled",
    ],
    [
      "a trigger with the wrong timing and event",
      {
        requiredTriggers: REQUIRED_DATABASE_TRIGGERS.map((item) =>
          item.name === "prevent_project_code_cycle"
            ? {
                ...item,
                definition:
                  "CREATE TRIGGER prevent_project_code_cycle AFTER DELETE ON project_codes FOR EACH STATEMENT EXECUTE FUNCTION prevent_project_code_cycle()",
              }
            : { ...item }
        ),
      },
      "definition",
    ],
    [
      "a policy with the wrong name",
      {
        policies: REQUIRED_DATABASE_POLICIES.map((item) =>
          item.table === "project_documents"
            ? { ...item, name: "open_documents", roles: [...item.roles] }
            : { ...item, roles: [...item.roles] }
        ),
      },
      "documents_select_members",
    ],
    [
      "a policy on a relation with RLS disabled",
      {
        policies: REQUIRED_DATABASE_POLICIES.map((item) =>
          item.table === "project_documents"
            ? { ...item, rlsEnabled: false, roles: [...item.roles] }
            : { ...item, roles: [...item.roles] }
        ),
      },
      "RLS",
    ],
    [
      "an open policy with USING true",
      {
        policies: REQUIRED_DATABASE_POLICIES.map((item) =>
          item.table === "project_documents"
            ? { ...item, qual: "true", roles: [...item.roles] }
            : { ...item, roles: [...item.roles] }
        ),
      },
      "qual",
    ],
    [
      "a select policy with an unexpected WITH CHECK",
      {
        policies: REQUIRED_DATABASE_POLICIES.map((item) =>
          item.table === "project_documents"
            ? { ...item, withCheck: "true", roles: [...item.roles] }
            : { ...item, roles: [...item.roles] }
        ),
      },
      "with-check",
    ],
    [
      "a policy with the wrong command and role",
      {
        policies: REQUIRED_DATABASE_POLICIES.map((item) =>
          item.table === "project_documents"
            ? { ...item, command: "ALL", roles: ["public"] }
            : { ...item, roles: [...item.roles] }
        ),
      },
      "command",
    ],
    [
      "a restrictive policy in place of the required permissive policy",
      {
        policies: REQUIRED_DATABASE_POLICIES.map((item) =>
          item.table === "project_documents"
            ? { ...item, permissive: "RESTRICTIVE", roles: [...item.roles] }
            : { ...item, roles: [...item.roles] }
        ),
      },
      "permissiveness",
    ],
    [
      "a foreign key with wrong local and referenced columns",
      {
        foreignKeys: REQUIRED_DATABASE_FOREIGN_KEYS.map((item) =>
          item.name === "project_document_segments_document_fkey"
            ? {
                ...item,
                columns: ["document_id"],
                referencedColumns: ["id"],
              }
            : {
                ...item,
                columns: [...item.columns],
                referencedColumns: [...item.referencedColumns],
              }
        ),
      },
      "project_document_segments_document_fkey",
    ],
    [
      "a foreign key with the wrong delete action",
      {
        foreignKeys: REQUIRED_DATABASE_FOREIGN_KEYS.map((item) =>
          item.name === "project_documents_project_id_fkey"
            ? {
                ...item,
                onDelete: "RESTRICT",
                columns: [...item.columns],
                referencedColumns: [...item.referencedColumns],
              }
            : {
                ...item,
                columns: [...item.columns],
                referencedColumns: [...item.referencedColumns],
              }
        ),
      },
      "ON DELETE",
    ],
    [
      "a deferrable foreign key",
      {
        foreignKeys: REQUIRED_DATABASE_FOREIGN_KEYS.map((item) =>
          item.name === "project_members_project_id_fkey"
            ? {
                ...item,
                deferrable: true,
                columns: [...item.columns],
                referencedColumns: [...item.referencedColumns],
              }
            : {
                ...item,
                columns: [...item.columns],
                referencedColumns: [...item.referencedColumns],
              }
        ),
      },
      "deferrable",
    ],
    [
      "a foreign key with the wrong update action",
      {
        foreignKeys: REQUIRED_DATABASE_FOREIGN_KEYS.map((item) =>
          item.name === "project_members_project_id_fkey"
            ? { ...item, onUpdate: "CASCADE", columns: [...item.columns], referencedColumns: [...item.referencedColumns] }
            : { ...item, columns: [...item.columns], referencedColumns: [...item.referencedColumns] }
        ),
      },
      "ON UPDATE",
    ],
    [
      "an initially deferred foreign key",
      {
        foreignKeys: REQUIRED_DATABASE_FOREIGN_KEYS.map((item) =>
          item.name === "project_members_project_id_fkey"
            ? { ...item, initiallyDeferred: true, columns: [...item.columns], referencedColumns: [...item.referencedColumns] }
            : { ...item, columns: [...item.columns], referencedColumns: [...item.referencedColumns] }
        ),
      },
      "deferrable",
    ],
  ])("rejects %s", (_name, override, diagnostic) => {
    const result = validateDatabaseEvidence(presentEvidence(override), expectedHash);

    expect(result.state).toBe("invalid");
    expect(result.issues.join(" ")).toContain(diagnostic);
  });

  it("keeps the hard-coded migration contract synchronized with local files", () => {
    const migrationDirectory = path.resolve(
      process.cwd(),
      "supabase/supabase/migrations"
    );
    const localVersions = readdirSync(migrationDirectory)
      .filter((name) => name.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right))
      .map((name) => name.split("_")[0]);

    expect(EXPECTED_MIGRATION_VERSIONS).toEqual(localVersions);
  });

  it("rejects evidence collected from a different approved environment", () => {
    expect(
      validateDatabaseEvidenceTarget(presentEvidence(), "d".repeat(64))
    ).toEqual({
      state: "invalid",
      issues: ["Database evidence target does not match the current test environment."],
    });
    expect(
      validateDatabaseEvidenceTarget(presentEvidence(), "c".repeat(64))
    ).toEqual({ state: "present", issues: [] });
    expect(
      validateDatabaseEvidenceTarget(
        presentEvidence({ targetDatabase: "shadow" }),
        "c".repeat(64),
        "postgres"
      )
    ).toEqual({
      state: "invalid",
      issues: ["Database evidence target does not match the current test environment."],
    });
  });
});

describe("database evidence collector", () => {
  const script = path.resolve(process.cwd(), "scripts/backend-database-evidence.mjs");

  function fakePsql(
    directory: string,
    gate = "t\tt\tt\tpostgres",
    catalog = presentEvidence()
  ) {
    const executable = path.join(directory, "psql");
    writeFileSync(
      executable,
      `#!/bin/sh
calls_file="\${0%/*}/psql-calls.txt"
printf '%s\\n' "$*" >> "$calls_file"
case "$*" in
  *transaction_read_only*) printf '${gate}\\n' ;;
  *) printf '%s\\n' '${JSON.stringify({
    requiredFunctions: catalog.requiredFunctions,
    requiredIndexes: catalog.requiredIndexes,
    requiredTriggers: catalog.requiredTriggers,
    appliedMigrations: catalog.appliedMigrations,
    foreignKeys: catalog.foreignKeys,
    policies: catalog.policies,
  })}' ;;
esac
`,
      "utf8"
    );
    chmodSync(executable, 0o700);
    return executable;
  }

  it("writes not-demonstrated evidence and exits nonzero when the URL is absent", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    try {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
      };
      delete env.TEST_DATABASE_READONLY_URL;
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        state: "not-demonstrated",
        issues: [expect.stringContaining("TEST_DATABASE_READONLY_URL")],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never writes credentials when psql is unavailable", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const secret = "collector-password-do-not-print";
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL: `postgresql://readonly:${secret}@db.project-a.supabase.co:5432/postgres`,
        },
        encoding: "utf8",
      });
      const serialized = [
        result.stdout,
        result.stderr,
        readFileSync(output, "utf8"),
      ].join("\n");

      expect(result.status).toBe(1);
      expect(serialized).not.toContain(secret);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        state: "not-demonstrated",
        issues: [expect.stringContaining("psql")],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("asserts the safe role first and only then records catalog evidence", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const calls = path.join(directory, "psql-calls.txt");
    fakePsql(directory);
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          PSQL_CALLS: calls,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-a.supabase.co:5432/postgres",
        },
        encoding: "utf8",
      });
      const evidence = JSON.parse(readFileSync(output, "utf8"));
      const invocations = readFileSync(calls, "utf8");

      expect(result.status).toBe(0);
      expect(invocations.match(/^-X/gmu)).toHaveLength(2);
      expect(invocations.indexOf("transaction_read_only")).toBeLessThan(
        invocations.indexOf("pg_policies")
      );
      expect(invocations).not.toContain("private-value");
      expect(validateDatabaseEvidence(evidence, evidence.migrationsHash)).toEqual({
        state: "present",
        issues: [],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never queries catalogs after an unsafe role assertion", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const calls = path.join(directory, "psql-calls.txt");
    fakePsql(directory, "t\tf\tt");
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          PSQL_CALLS: calls,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-a.supabase.co:5432/postgres",
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(readFileSync(calls, "utf8").match(/^-X/gmu)).toHaveLength(1);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        state: "invalid",
        issues: [expect.stringContaining("least-privileged")],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never queries catalogs when current_database is not the approved database", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const calls = path.join(directory, "psql-calls.txt");
    fakePsql(directory, "t\tt\tt\tshadow");
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-a.supabase.co:5432/postgres",
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(readFileSync(calls, "utf8").match(/^-X/gmu)).toHaveLength(1);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        state: "invalid",
        issues: [expect.stringContaining("approved database")],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("exits nonzero when psql succeeds but a required catalog object is absent", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const calls = path.join(directory, "psql-calls.txt");
    fakePsql(directory, "t\tt\tt\tpostgres", presentEvidence({ requiredTriggers: [] }));
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          PSQL_CALLS: calls,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-a.supabase.co:5432/postgres",
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      const evidence = JSON.parse(readFileSync(output, "utf8"));
      expect(evidence.state).toBe("invalid");
      expect(evidence.issues.join(" ")).toContain("prevent_project_code_cycle");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a database from another Supabase project before invoking psql", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const calls = path.join(directory, "psql-calls.txt");
    fakePsql(directory);
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          PSQL_CALLS: calls,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-b.supabase.co:5432/postgres",
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(existsSync(calls)).toBe(false);
      const serialized = readFileSync(output, "utf8");
      expect(serialized).not.toContain("project-b");
      expect(JSON.parse(serialized)).toMatchObject({
        state: "invalid",
        issues: [expect.stringContaining("approved Supabase environment")],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("binds the evidence hash to both the approved host and database name", () => {
    expect(databaseTargetHash("project-a.supabase.co", "postgres")).toMatch(
      /^[a-f0-9]{64}$/u
    );
    expect(databaseTargetHash("project-a.supabase.co", "postgres")).not.toBe(
      databaseTargetHash("project-a.supabase.co", "shadow")
    );
  });

  it("rejects a different database name before invoking psql", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const calls = path.join(directory, "psql-calls.txt");
    fakePsql(directory);
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_ALLOWED_DATABASE_NAME: "postgres",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-a.supabase.co:5432/shadow",
        },
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(existsSync(calls)).toBe(false);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        state: "invalid",
        issues: [expect.stringContaining("approved Supabase environment")],
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("passes only an allowlisted runtime and PG environment to psql", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "backend-db-evidence-"));
    const output = path.join(directory, "database-evidence.json");
    const executable = fakePsql(directory);
    const scriptText = readFileSync(executable, "utf8").replace(
      "case \"$*\" in",
      `if [ ! -f "\${0%/*}/psql-env-names.txt" ]; then\n  /usr/bin/env | /usr/bin/cut -d= -f1 | /usr/bin/sort > "\${0%/*}/psql-env-names.txt"\nfi\ncase "$*" in`
    );
    writeFileSync(executable, scriptText, "utf8");
    try {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: directory,
          BACKEND_DATABASE_EVIDENCE_OUTPUT: output,
          NEXT_PUBLIC_SUPABASE_URL: "https://project-a.supabase.co",
          TEST_ALLOWED_SUPABASE_HOST: "project-a.supabase.co",
          TEST_DATABASE_READONLY_URL:
            "postgresql://readonly:private-value@db.project-a.supabase.co:5432/postgres",
          SUPABASE_SERVICE_ROLE_KEY: "must-not-reach-child",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "must-not-reach-child",
          TEST_USER_PASSWORD: "must-not-reach-child",
          AI_GATEWAY_API_KEY: "must-not-reach-child",
          APPLICATION_PRIVATE_SENTINEL: "must-not-reach-child",
        },
        encoding: "utf8",
      });
      const childNames = readFileSync(
        path.join(directory, "psql-env-names.txt"),
        "utf8"
      ).split("\n");

      expect(result.status).toBe(0);
      expect(childNames).toEqual(expect.arrayContaining(["PATH", "PGHOST", "PGDATABASE"]));
      for (const forbidden of [
        "SUPABASE_SERVICE_ROLE_KEY",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "TEST_USER_PASSWORD",
        "AI_GATEWAY_API_KEY",
        "APPLICATION_PRIVATE_SENTINEL",
        "TEST_DATABASE_READONLY_URL",
      ]) {
        expect(childNames).not.toContain(forbidden);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
