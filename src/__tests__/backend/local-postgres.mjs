// Offline-only SQL harness. No application environment, credentials, network, or shared database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export async function withLocalPostgres(run, { toolingRoot }) {
  if (!path.isAbsolute(toolingRoot)) throw new Error('An explicit absolute toolingRoot is required (native PostgreSQL and pg package directory)');
  const tooling = toolingRoot;
  const bin = path.join(tooling, '@embedded-postgres/darwin-arm64/native/bin');
  const { default: { Client } } = await import(pathToFileURL(path.join(tooling, 'pg/lib/index.js')).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'antropologia-sql-'));
  const data = path.join(root, 'data');
  const socket = path.join(root, 'socket');
  fs.mkdirSync(socket, { mode: 0o700 });
  const clients = new Set();
  let pid;
  let stopping;
  const alive = (id) => { try { process.kill(id, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } };
  async function stop() {
    if (stopping) return stopping;
    stopping = (async () => {
      const descendants = pid ? execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).trim().split('\n').map(row => row.trim().split(/\s+/).map(Number)).filter(row => row[1] === pid).map(row => row[0]) : [];
      // End sessions before stopping. pg_ctl fast also rolls back active sessions.
      const closes = [...clients].map(c => c.end().catch(() => {}));
      if (pid && alive(pid)) {
        try { execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-t', '5', '-w', 'stop'], { stdio: 'pipe', timeout: 8000 }); }
        catch (error) {
          if (alive(pid)) execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-t', '5', '-w', 'stop'], { stdio: 'pipe', timeout: 8000 });
          else console.warn('pg_ctl fast stop returned an error after server exit:', error.message);
        }
      }
      await Promise.all(closes);
      const remaining = [pid, ...descendants].filter(Boolean).filter(alive);
      if (remaining.length) throw new Error(`Owned PostgreSQL processes remain: ${remaining.join(',')}`);
      console.log(JSON.stringify({ cleanup: 'verified', root, pid, descendants }));
    })();
    return stopping;
  }
  const signals = ['SIGINT', 'SIGTERM'];
  const onSignal = () => { stop().then(() => process.exit(130), error => { console.error(error); process.exit(1); }); };
  signals.forEach(s => process.once(s, onSignal));
  try {
    execFileSync(path.join(bin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { stdio: 'pipe', timeout: 20000 });
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-k ${socket} -c listen_addresses='' -c unix_socket_permissions=0700 -c max_connections=10 -c shared_buffers=16MB`, '-t', '10', '-w', 'start'], { stdio: 'pipe', timeout: 15000 });
    pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    console.log(JSON.stringify({ started: pid, root, socket, version: execFileSync(path.join(bin, 'postgres'), ['--version'], { encoding: 'utf8' }).trim() }));
    async function connect() {
      const client = new Client({ host: socket, user: 'postgres', database: 'postgres', connectionTimeoutMillis: 3000, statement_timeout: 5000 });
      clients.add(client);
      await client.connect();
      return client;
    }
    await run({ connect, root });
  } finally {
    // Capture a server started just before an unexpected pg_ctl/start error.
    if (!pid && fs.existsSync(path.join(data, 'postmaster.pid'))) pid = Number(fs.readFileSync(path.join(data, 'postmaster.pid'), 'utf8').split('\n')[0]);
    await stop();
    signals.forEach(s => process.removeListener(s, onSignal));
  }
}

function catalog(dir, name) {
  const wrapper = JSON.parse(fs.readFileSync(path.join(dir, `catalog-${name}.json`), 'utf8'));
  const text = JSON.parse(wrapper.content[0].text).result;
  return JSON.parse(text.slice(text.indexOf('[{'), text.lastIndexOf('}]') + 2));
}

export async function installTeamCatalog(db, { catalogDir }) {
  if (!path.isAbsolute(catalogDir)) throw new Error('An explicit absolute catalogDir is required (captured schema-only metadata)');
  const rows = name => catalog(catalogDir, name);
  await db.query(`
    CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon;
    CREATE TYPE public.project_role AS ENUM ('owner', 'editor', 'viewer');
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id));
    CREATE TABLE public.projects(id uuid PRIMARY KEY);
    CREATE TABLE public.project_invitations(project_id uuid, status text, expires_at timestamptz, role project_role, email text);
    ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
  `);
  const tables = ['project_members', 'project_activity_events'];
  for (const table of tables) {
    const columns = rows('columns').filter(row => row.table_name === table).map(row => `${row.column_name} ${row.column_type}${row.not_null ? ' NOT NULL' : ''}${row.default_value ? ` DEFAULT ${row.default_value}` : ''}`);
    await db.query(`CREATE TABLE public.${table} (${columns.join(',')})`);
    for (const c of rows('constraints').filter(row => row.table_name === table)) await db.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${c.conname} ${c.definition}`);
    await db.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  }
  for (const helper of [...rows('helpers'), ...rows('extra-helpers')]) await db.query(helper.definition);
  for (const policy of rows('policies').filter(row => tables.includes(row.tablename))) {
    await db.query(`CREATE POLICY ${policy.policyname} ON public.${policy.tablename} AS ${policy.permissive} FOR ${policy.cmd} TO ${policy.roles.slice(1, -1)}${policy.qual ? ` USING (${policy.qual})` : ''}${policy.with_check ? ` WITH CHECK (${policy.with_check})` : ''}`);
  }
  for (const grant of rows('grants').filter(row => tables.includes(row.table_name))) await db.query(`GRANT ${grant.privilege_type} ON public.${grant.table_name} TO ${grant.grantee}`);
  // Catalog reports no non-internal triggers on either table. FK triggers are created by constraints.
  if (rows('triggers').some(row => tables.includes(row.table_name))) throw new Error('Unexpected team trigger metadata: reconstruction needs updating');
}
