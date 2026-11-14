/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { resolve, basename } = require("node:path");

/**
 * @typedef {{
 *   gitSha: string,
 *   dirty: boolean,
 *   nodeVersion: string,
 *   migrationsHash: string,
 *   environmentHash: string
 * }} RunContext
 */

function hashMigrationEntries(entries) {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function migrationEntries(appRoot) {
  const directory = resolve(appRoot, "supabase/supabase/migrations");
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => ({ path: entry.name, content: readFileSync(resolve(directory, entry.name), "utf8") }));
}

function hashEnvironmentHost(supabaseHost) {
  if (!supabaseHost) return "not-configured";
  return createHash("sha256").update(supabaseHost).digest("hex");
}

function collectRunContext(appRoot, options = {}) {
  const command =
    options.command ??
    ((file, args) => execFileSync(file, args, { cwd: appRoot, encoding: "utf8" }));
  const gitSha = String(command("git", ["rev-parse", "HEAD"])).trim();
  const transient = new Set([".backend-mutating-run.lock", ".backend-mutating-run.lock.guard/"].flatMap(file => [file, `${basename(appRoot)}/${file}`]));
  const dirty = String(command("git", ["status", "--porcelain"])).split("\n")
    .some(line => line.trim() && !(line.startsWith("?? ") && transient.has(line.slice(3))));
  const entries = options.migrationEntries ?? migrationEntries(appRoot);

  return {
    gitSha,
    dirty,
    nodeVersion: options.nodeVersion ?? process.version,
    migrationsHash: hashMigrationEntries(entries),
    environmentHash: hashEnvironmentHost(options.supabaseHost),
  };
}

module.exports = {
  collectRunContext,
  hashEnvironmentHost,
  hashMigrationEntries,
};
