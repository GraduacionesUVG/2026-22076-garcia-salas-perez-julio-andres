// Offline-only regression using captured schema metadata and disposable synthetic actors.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withLocalPostgres, installTeamCatalog } from './local-postgres.mjs';

const [toolingRoot, catalogDir, migration] = process.argv.slice(2);
const rows = name => {
  const text = JSON.parse(JSON.parse(fs.readFileSync(path.join(catalogDir, `catalog-${name}.json`))).content[0].text).result;
  return JSON.parse(text.slice(text.indexOf('[{'), text.lastIndexOf('}]') + 2));
};
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let passed = 0;
await withLocalPostgres(async ({ connect }) => {
  const db = await connect();
  await installTeamCatalog(db, { catalogDir });
  const table = 'project_participants';
  const columns = rows('columns').filter(r => r.table_name === table).map(r => `${r.column_name} ${r.column_type}${r.not_null ? ' NOT NULL' : ''}${r.default_value ? ` DEFAULT ${r.default_value}` : ''}`);
  await db.query(`CREATE TABLE public.${table} (${columns.join(',')})`);
  for (const c of rows('constraints').filter(r => r.table_name === table)) await db.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${c.conname} ${c.definition}`);
  // Constraint-backed indexes already exist; install all remaining captured indexes exactly.
  for (const index of rows('participant-indexes')) {
    const existing = await db.query("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1", [index.indexname]);
    if (!existing.rowCount) await db.query(index.indexdef);
  }
  await db.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  for (const p of rows('policies').filter(r => r.tablename === table)) await db.query(`CREATE POLICY ${p.policyname} ON public.${table} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.slice(1, -1)}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''}`);
  for (const g of rows('grants').filter(r => r.table_name === table)) await db.query(`GRANT ${g.privilege_type} ON public.${table} TO ${g.grantee}`);
  for (const t of rows('triggers').filter(r => r.table_name === table)) { await db.query(t.function_definition); await db.query(t.definition); }
  for (const n of [1, 2, 3, 4]) {
    await db.query('INSERT INTO auth.users VALUES ($1);', [id(n)]);
    await db.query('INSERT INTO profiles VALUES ($1);', [id(n)]);
  }
  for (const project of [id(10), id(11)]) {
    await db.query('INSERT INTO projects VALUES ($1)', [project]);
    for (const [n, role] of [[1, 'owner'], [2, 'editor'], [3, 'viewer']]) await db.query('INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,$3)', [project, id(n), role]);
  }
  // Prove migration initializes preexisting rows without firing the audit UPDATE trigger.
  await db.query("INSERT INTO project_participants(id,project_id,alias,created_at,updated_at) VALUES ($1,$2,'legacy','2000-01-01T00:00:00Z','2000-01-02T00:00:00Z')", [id(19), id(10)]);
  if (migration !== '-') await db.query(fs.readFileSync(migration, 'utf8'));
  const actor = async n => {
    const client = await connect();
    await client.query('SET ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
    return client;
  };
  const owner = await actor(1), editor = await actor(2), viewer = await actor(3), outsider = await actor(4);
  const check = async (label, run) => { await run(); passed++; console.log(`PASS ${label}`); };
  const read = async (client = viewer, participant = id(20)) => (await client.query('SELECT * FROM project_participants WHERE project_id=$1 AND id=$2', [id(10), participant])).rows[0];
  const update = (client, revision, notes, participant = id(20), project = id(10)) => client.query('UPDATE project_participants SET notes=$1 WHERE project_id=$2 AND id=$3 AND deleted_at IS NULL AND revision=$4 RETURNING *', [notes, project, participant, revision]);
  await check('migration initializes existing revision without changing audit fields', async () => {
    const legacy = await read(viewer, id(19));
    assert.equal(Number(legacy.revision), 0);
    assert.equal(legacy.updated_at.toISOString(), '2000-01-02T00:00:00.000Z');
  });
  await check('revision trigger is enabled, invoker-only and not a callable authenticated/anonymous RPC', async () => {
    const functionState = (await db.query("SELECT prosecdef, has_function_privilege('authenticated',oid,'EXECUTE') authenticated, has_function_privilege('anon',oid,'EXECUTE') anon FROM pg_proc WHERE oid='public.set_project_participant_revision()'::regprocedure")).rows[0];
    assert.deepEqual(functionState, { prosecdef: false, authenticated: false, anon: false });
    const trigger = (await db.query("SELECT tgenabled, pg_get_triggerdef(oid,true) definition FROM pg_trigger WHERE tgname='trg_project_participants_revision'")).rows[0];
    assert.equal(trigger.tgenabled, 'O');
    assert.equal(trigger.definition, 'CREATE TRIGGER trg_project_participants_revision BEFORE INSERT OR UPDATE ON project_participants FOR EACH ROW EXECUTE FUNCTION set_project_participant_revision()');
  });
  await check('INSERT forces revision zero including malicious caller value and preserves audit', async () => {
    const row = (await editor.query("INSERT INTO project_participants(id,project_id,alias,revision,attributes) VALUES ($1,$2,'Race',999,'{\"subsample\":\"urban\"}') RETURNING *", [id(20), id(10)])).rows[0];
    assert.equal(Number(row.revision), 0); assert.equal(row.created_by, id(2));
    assert.deepEqual((await read()).attributes, { subsample: 'urban' });
  });
  await check('forced overlap on separate authenticated connections: one success and one stale, independent unchanged read', async () => {
    await owner.query('BEGIN');
    try {
      const first = await update(owner, 0, 'winner');
      assert.equal(Number(first.rows[0].revision), 1);
      const editorPid = (await editor.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const pending = update(editor, 0, 'loser');
      // Observe the second UPDATE actually blocked behind the uncommitted first UPDATE.
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const waiting = await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [editorPid]);
        if (waiting.rows[0]?.wait_event_type === 'Lock') { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true, 'second updater must overlap on the row lock');
      await owner.query('COMMIT');
      assert.equal((await pending).rowCount, 0);
      const before = await read();
      assert.equal(Number(before.revision), 1); assert.equal(before.notes, 'winner'); assert.equal(before.updated_by, id(1));
      assert.equal((await update(editor, 0, 'stale again')).rowCount, 0);
      assert.deepEqual(await read(), before, 'stale write changes neither data nor audit fields');
    } finally { await owner.query('ROLLBACK'); }
  });
  await check('direct allowed update cannot force revision; legacy omission increments exactly once', async () => {
    await editor.query("UPDATE project_participants SET revision=0,notes='legacy',status='inactive',attributes='{\"subsample\":\"rural\"}' WHERE id=$1", [id(20)]);
    const row = await read();
    assert.equal(Number(row.revision), 2); assert.equal(row.updated_by, id(2)); assert.equal(row.status, 'inactive');
    assert.deepEqual(row.attributes, { subsample: 'rural' });
    assert.equal((await update(owner, 1, 'stale after legacy')).rowCount, 0);
  });
  await check('RLS denies viewer/outsider/anon writes, member reads and project-scoped predicates remain intact', async () => {
    const before = await read();
    for (const client of [viewer, outsider]) {
      assert.equal((await update(client, 2, 'forbidden')).rowCount, 0);
      await assert.rejects(client.query("INSERT INTO project_participants(project_id,alias) VALUES ($1,'denied')", [id(10)]), { code: '42501' });
    }
    assert.equal((await outsider.query('SELECT 1 FROM project_participants')).rowCount, 0);
    await outsider.query('SET ROLE anon');
    assert.equal((await update(outsider, 2, 'anonymous')).rowCount, 0);
    await outsider.query('SET ROLE authenticated');
    assert.equal((await update(owner, 2, 'foreign', id(20), id(11))).rowCount, 0);
    assert.deepEqual(await read(), before);
  });
  await check('status/attributes/alias constraints roll back revision and audit; active alias remains case insensitive', async () => {
    const before = await read();
    for (const sql of ["status='unknown'", "attributes='[]'", "alias=' '"]) {
      await assert.rejects(editor.query(`UPDATE project_participants SET ${sql} WHERE id=$1`, [id(20)]), { code: '23514' });
      assert.deepEqual(await read(), before);
    }
    await assert.rejects(editor.query("INSERT INTO project_participants(project_id,alias) VALUES ($1,'rACE')", [id(10)]), { code: '23505' });
    await editor.query("INSERT INTO project_participants(id,project_id,alias) VALUES ($1,$2,'Other')", [id(21), id(10)]);
    await assert.rejects(editor.query("UPDATE project_participants SET alias='RACE' WHERE id=$1", [id(21)]), { code: '23505' });
    assert.equal(Number((await read(viewer, id(21))).revision), 0);
    await editor.query("INSERT INTO project_participants(project_id,alias) VALUES ($1,'Race')", [id(11)]);
  });
  await check('all supported statuses persist; soft delete increments and blocks further conditional edits, releases alias', async () => {
    for (const status of ['withdrawn', 'archived', 'active']) await editor.query('UPDATE project_participants SET status=$1 WHERE id=$2', [status, id(20)]);
    assert.equal(Number((await read()).revision), 5);
    await editor.query('UPDATE project_participants SET deleted_at=now(),revision=0 WHERE id=$1', [id(20)]);
    const row = await read();
    assert.equal(Number(row.revision), 6); assert.ok(row.deleted_at);
    assert.equal((await update(owner, 6, 'after deletion')).rowCount, 0);
    assert.equal((await viewer.query('SELECT 1 FROM project_participants WHERE id=$1 AND deleted_at IS NULL', [id(20)])).rowCount, 0);
    await editor.query("INSERT INTO project_participants(project_id,alias) VALUES ($1,'race')", [id(10)]);
    assert.deepEqual(await read(), row);
  });
  await check('safe-integer exhaustion fails atomically; no wraparound or caller reset', async () => {
    // Superuser-only fixture setup reaches the boundary without 9 quadrillion real writes.
    await db.query('ALTER TABLE project_participants DISABLE TRIGGER trg_project_participants_revision');
    try { await db.query('UPDATE project_participants SET revision=9007199254740991 WHERE id=$1', [id(21)]); }
    finally { await db.query('ALTER TABLE project_participants ENABLE TRIGGER trg_project_participants_revision'); }
    const before = await read(viewer, id(21));
    await assert.rejects(editor.query("UPDATE project_participants SET revision=0,notes='overflow' WHERE id=$1", [id(21)]), { code: '23514' });
    assert.deepEqual(await read(viewer, id(21)), before);
  });
  console.log(JSON.stringify({ passed, failed: 0, scope: 'local PostgreSQL only; not Supabase Data API' }));
}, { toolingRoot });
