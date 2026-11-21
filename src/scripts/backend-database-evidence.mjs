import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const migrationsDirectory = path.resolve(root, "supabase/supabase/migrations");
const output = path.resolve(
  process.env.BACKEND_DATABASE_EVIDENCE_OUTPUT ??
    path.join(root, "__tests__/reports/database-evidence.json")
);

async function importTypeScript(relativePath) {
  const absolute = path.join(root, relativePath);
  const source = readFileSync(absolute, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      sourceMap: false,
    },
    fileName: absolute,
  }).outputText;
  const sourceUrl = pathToFileURL(absolute).href;
  const encoded = Buffer.from(`${transpiled}\n//# sourceURL=${sourceUrl}`).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

const databaseContract = await importTypeScript("__tests__/backend/database-evidence.ts");
const {
  DATABASE_BEHAVIORAL_EVIDENCE_SCOPE,
  REQUIRED_DATABASE_FUNCTIONS,
  REQUIRED_DATABASE_FOREIGN_KEYS,
  REQUIRED_DATABASE_INDEXES,
  REQUIRED_DATABASE_POLICIES,
  REQUIRED_DATABASE_TRIGGERS,
  databaseTargetHash,
  validateDatabaseEvidence,
} = databaseContract;

function migrationFiles() {
  return existsSync(migrationsDirectory)
    ? readdirSync(migrationsDirectory)
        .filter((name) => name.endsWith(".sql"))
        .sort((left, right) => left.localeCompare(right))
    : [];
}

function migrationVersions() {
  return migrationFiles().map((name) => name.split("_")[0]);
}

function migrationsHash() {
  const hash = createHash("sha256");
  for (const name of migrationFiles()) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(path.join(migrationsDirectory, name), "utf8"));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function writeEvidence(value) {
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finish(state, issues, details = {}) {
  writeEvidence({
    ...details,
    state,
    issues,
    migrationsHash: migrationsHash(),
    behavioralEvidence: DATABASE_BEHAVIORAL_EVIDENCE_SCOPE,
  });
  if (state !== "present") process.exitCode = 1;
}

function parseDatabaseUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Unsupported database URL protocol.");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (!parsed.hostname || !database || !parsed.username) {
    throw new Error("Incomplete database URL.");
  }
  return parsed;
}

function approvedEnvironment(rawDatabaseUrl) {
  const rawApplicationUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const allowedHost = process.env.TEST_ALLOWED_SUPABASE_HOST?.toLowerCase();
  const allowedDatabase = (process.env.TEST_ALLOWED_DATABASE_NAME ?? "postgres").trim();
  if (!rawApplicationUrl || !allowedHost) {
    throw new Error("Approved application environment is not configured.");
  }
  const applicationUrl = new URL(rawApplicationUrl);
  const applicationHost = applicationUrl.hostname.toLowerCase();
  if (applicationHost !== allowedHost) {
    throw new Error("Application environment is not approved.");
  }

  const databaseUrl = parseDatabaseUrl(rawDatabaseUrl);
  const databaseHost = databaseUrl.hostname.toLowerCase();
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//u, ""));
  const databaseUser = decodeURIComponent(databaseUrl.username);
  const project = applicationHost.match(/^([a-z0-9-]+)\.supabase\.co$/u)?.[1];
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isBound = project
    ? databaseHost === `db.${project}.supabase.co` ||
      (databaseHost.endsWith(".pooler.supabase.com") &&
        databaseUser.endsWith(`.${project}`))
    : localHosts.has(applicationHost) && localHosts.has(databaseHost);

  if (!/^[A-Za-z0-9_-]+$/u.test(allowedDatabase) || !isBound || databaseName !== allowedDatabase) {
    throw new Error("Database environment does not match the application.");
  }
  return {
    databaseUrl,
    targetDatabase: databaseName,
    targetEnvironmentHash: databaseTargetHash(applicationHost, databaseName),
  };
}

function connectionEnvironment(parsed) {
  const env = {};
  for (const name of [
    "PATH", "SystemRoot", "WINDIR", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
    "TMPDIR", "TMP", "TEMP", "SSL_CERT_FILE", "SSL_CERT_DIR",
  ]) {
    if (typeof process.env[name] === "string") env[name] = process.env[name];
  }
  Object.assign(env, {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//u, "")),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGCONNECT_TIMEOUT: "5",
    PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=5000",
  });
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

function psql(sql, env) {
  return spawnSync(
    "psql",
    ["-X", "-A", "-t", "--set=ON_ERROR_STOP=1", "--field-separator=\t", "--command", sql],
    { cwd: root, env, encoding: "utf8", timeout: 10_000 }
  );
}

function sqlNames(values) {
  return values
    .map((value) => `'${String(value).replaceAll("'", "''")}'`)
    .join(",");
}

const rawUrl = process.env.TEST_DATABASE_READONLY_URL;
if (!rawUrl) {
  finish("not-demonstrated", ["TEST_DATABASE_READONLY_URL is not configured."]);
} else {
  let target;
  try {
    target = approvedEnvironment(rawUrl);
  } catch {
    finish("invalid", ["TEST_DATABASE_READONLY_URL does not match the approved Supabase environment."]);
  }

  if (target) {
    const env = connectionEnvironment(target.databaseUrl);
    const gate = psql(
      `select current_setting('transaction_read_only') = 'on' as transaction_read_only,
       not r.rolsuper as not_superuser,
       not r.rolbypassrls as not_bypassrls,
       current_database()
from pg_roles r
where r.rolname = current_user;`,
      env
    );

    if (gate.error?.code === "ENOENT") {
      finish("not-demonstrated", ["psql is not available for read-only catalog evidence."]);
    } else if (gate.error || gate.status !== 0) {
      finish("invalid", ["The read-only database safety assertion failed."]);
    } else {
      const [transactionReadOnly, notSuperuser, notBypassRls, currentDatabase] = gate.stdout.trim().split("\t");
      if (transactionReadOnly !== "t" || notSuperuser !== "t" || notBypassRls !== "t") {
        finish("invalid", ["The catalog role is not least-privileged and read-only."]);
      } else if (currentDatabase !== target.targetDatabase) {
        finish("invalid", ["The connected database is not the approved database."]);
      } else {
        const functionNames = sqlNames(REQUIRED_DATABASE_FUNCTIONS.map((item) => item.name));
        const indexNames = sqlNames(REQUIRED_DATABASE_INDEXES.map((item) => item.name));
        const triggerNames = sqlNames(REQUIRED_DATABASE_TRIGGERS.map((item) => item.name));
        const policyTables = sqlNames(REQUIRED_DATABASE_POLICIES.map((item) => item.table));
        const foreignKeyNames = sqlNames(REQUIRED_DATABASE_FOREIGN_KEYS.map((item) => item.name));
        const catalog = psql(
          `select json_build_object(
  'requiredFunctions', coalesce((select json_agg(json_build_object('name', p.proname, 'identityArguments', pg_get_function_identity_arguments(p.oid), 'result', pg_get_function_result(p.oid)) order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${functionNames})), '[]'::json),
  'requiredIndexes', coalesce((select json_agg(json_build_object('name', ic.relname, 'table', c.relname, 'method', am.amname, 'unique', x.indisunique, 'valid', x.indisvalid, 'ready', x.indisready, 'columns', cols.columns, 'includedColumns', coalesce(included.columns, '[]'::json), 'predicate', pg_get_expr(x.indpred, x.indrelid)) order by ic.relname) from pg_index x join pg_class ic on ic.oid = x.indexrelid join pg_class c on c.oid = x.indrelid join pg_namespace n on n.oid = c.relnamespace join pg_am am on am.oid = ic.relam cross join lateral (select json_agg(pg_get_indexdef(x.indexrelid, key_position, true) order by key_position) as columns from generate_series(1, x.indnkeyatts) key_position) cols cross join lateral (select json_agg(pg_get_indexdef(x.indexrelid, include_position, true) order by include_position) as columns from generate_series(x.indnkeyatts + 1, x.indnatts) include_position) included where n.nspname = 'public' and ic.relname in (${indexNames})), '[]'::json),
  'requiredTriggers', coalesce((select json_agg(json_build_object('name', t.tgname, 'table', c.relname, 'function', p.proname, 'enabled', t.tgenabled::text, 'definition', pg_get_triggerdef(t.oid, true)) order by t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid where n.nspname = 'public' and not t.tgisinternal and t.tgname in (${triggerNames})), '[]'::json),
  'appliedMigrations', coalesce((select json_agg(m.version::text order by m.version::text) from supabase_migrations.schema_migrations m), '[]'::json),
  'foreignKeys', coalesce((select json_agg(json_build_object('name', x.conname, 'table', c.relname, 'columns', (select json_agg(a.attname order by k.ordinality) from unnest(x.conkey) with ordinality k(attnum, ordinality) join pg_attribute a on a.attrelid = x.conrelid and a.attnum = k.attnum), 'referencedTable', rc.relname, 'referencedColumns', (select json_agg(a.attname order by k.ordinality) from unnest(x.confkey) with ordinality k(attnum, ordinality) join pg_attribute a on a.attrelid = x.confrelid and a.attnum = k.attnum), 'onUpdate', case x.confupdtype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end, 'onDelete', case x.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end, 'deferrable', x.condeferrable, 'initiallyDeferred', x.condeferred) order by x.conname) from pg_constraint x join pg_class c on c.oid = x.conrelid join pg_class rc on rc.oid = x.confrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and x.contype = 'f' and x.conname in (${foreignKeyNames})), '[]'::json),
  'policies', coalesce((select json_agg(json_build_object('name', p.policyname, 'table', p.tablename, 'command', p.cmd, 'roles', p.roles, 'permissive', p.permissive, 'qual', p.qual, 'withCheck', p.with_check, 'rlsEnabled', c.relrowsecurity) order by p.tablename, p.policyname) from pg_policies p join pg_namespace n on n.nspname = p.schemaname join pg_class c on c.relnamespace = n.oid and c.relname = p.tablename where p.schemaname = 'public' and p.tablename in (${policyTables})), '[]'::json)
);`,
          env
        );
        if (catalog.error || catalog.status !== 0) {
          finish("invalid", ["The read-only catalog query failed."]);
        } else {
          try {
            const rows = JSON.parse(catalog.stdout.trim());
            const candidate = {
              state: "present",
              issues: [],
              migrationsHash: migrationsHash(),
              targetEnvironmentHash: target.targetEnvironmentHash,
              targetDatabase: target.targetDatabase,
              behavioralEvidence: DATABASE_BEHAVIORAL_EVIDENCE_SCOPE,
              expectedMigrationVersions: migrationVersions(),
              transactionReadOnly: true,
              roleSuperuser: false,
              roleBypassRls: false,
              ...rows,
            };
            const validation = validateDatabaseEvidence(candidate, candidate.migrationsHash);
            if (validation.state !== "present") {
              finish("invalid", validation.issues, {
                ...candidate,
                state: undefined,
                issues: undefined,
                migrationsHash: undefined,
              });
            } else {
              finish("present", [], candidate);
            }
          } catch {
            finish("invalid", ["The read-only catalog result was malformed."]);
          }
        }
      }
    }
  }
}
