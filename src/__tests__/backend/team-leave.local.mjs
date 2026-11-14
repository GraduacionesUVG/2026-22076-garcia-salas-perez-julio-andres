import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withLocalPostgres, installTeamCatalog } from './local-postgres.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = id(1), foreign = id(2), owner = id(10), editor = id(11), viewer = id(12), intruder = id(13);
const migration = process.argv[2];
const toolingRoot = process.argv[3];
const catalogDir = process.argv[4];
if (!migration || !toolingRoot || !catalogDir) {
  console.error('Usage: node team-leave.local.mjs <migration.sql|--baseline> <absolute tooling node_modules> <absolute schema catalog directory>');
  process.exit(2);
}

withLocalPostgres(async ({ connect }) => {
  const db = await connect();
  await installTeamCatalog(db, { catalogDir });
  if (migration !== '--baseline') await db.query(fs.readFileSync(path.resolve(migration), 'utf8'));
  const a = await connect(), b = await connect();
  async function actor(client, user, role = 'authenticated') {
    await client.query(`SET ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  }
  async function reset() {
    await db.query('TRUNCATE project_activity_events, project_members, projects, profiles, auth.users CASCADE');
    await db.query('INSERT INTO auth.users SELECT unnest($1::uuid[])', [[owner, editor, viewer, intruder]]);
    await db.query('INSERT INTO profiles SELECT id FROM auth.users');
    await db.query('INSERT INTO projects VALUES ($1),($2)', [project, foreign]);
    await db.query("INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$3,'owner'),($1,$4,'editor'),($1,$5,'viewer'),($2,$6,'owner'),($2,$5,'viewer')", [project, foreign, owner, editor, viewer, intruder]);
  }
  const remove = (client, pid, target, suppliedActor) => client.query('SELECT public.remove_project_member_atomic($1,$2,$3)', [pid, target, suppliedActor]);
  async function counts(pid, user) {
    const result = await db.query("SELECT (SELECT count(*)::int FROM project_members WHERE project_id=$1 AND user_id=$2) members, (SELECT count(*)::int FROM project_activity_events WHERE project_id=$1 AND event_payload->>'user_id'=$2::text) events", [pid, user]);
    return result.rows[0];
  }
  if (migration === '--baseline') {
    await reset(); await actor(a, viewer);
    const result = await a.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [project, viewer]);
    assert.equal(result.rowCount, 1, 'non-owner self-leave must remove one row; original owner-only RLS silently removes zero');
    return;
  }
  const functionDefinition = (await db.query("SELECT prosecdef FROM pg_proc WHERE oid='public.remove_project_member_atomic(uuid,uuid,uuid)'::regprocedure")).rows[0];
  assert.equal(functionDefinition.prosecdef, false, 'mutation must run as invoker');
  let cases = 0;
  for (const [label, user, target, pid, marker] of [
    ['editor self', editor, editor, project, null], ['viewer self', viewer, viewer, project, null],
    ['editor other', editor, viewer, project, 'FORBIDDEN'], ['viewer other', viewer, editor, project, 'FORBIDDEN'],
    ['intruder', intruder, viewer, project, 'FORBIDDEN'], ['owner self', owner, owner, project, 'CANNOT_REMOVE_SELF'],
    ['owner removes viewer', owner, viewer, project, null], ['owner cross-project', owner, viewer, foreign, 'FORBIDDEN'],
    ['cannot target owner', owner, intruder, foreign, 'FORBIDDEN'],
  ]) {
    await reset(); await actor(a, user);
    if (marker) await assert.rejects(remove(a, pid, target, user), e => e.message === marker);
    else await remove(a, pid, target, user);
    assert.deepEqual(await counts(pid, target), marker ? { members: 1, events: 0 } : { members: 0, events: 1 });
    if (!marker) {
      const event = (await db.query('SELECT event_type, created_by FROM project_activity_events')).rows[0];
      assert.deepEqual(event, { event_type: 'member_removed', created_by: user });
      if (user === target) assert.equal((await a.query('SELECT * FROM project_members WHERE project_id=$1', [pid])).rowCount, 0);
    }
    if (pid === project) assert.deepEqual(await counts(foreign, viewer), { members: 1, events: 0 }, 'other project membership must be unchanged');
    cases++; console.log(`PASS ${label}`);
  }
  await reset(); await actor(a, viewer);
  await assert.rejects(remove(a, project, viewer, owner), e => e.message === 'FORBIDDEN');
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  cases++; console.log('PASS forged actor');
  await db.query("INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,'owner')", [project, intruder]);
  await actor(a, owner);
  await assert.rejects(remove(a, project, intruder, owner), e => e.message === 'PROJECT_MEMBER_OWNER_PROTECTED');
  assert.deepEqual(await counts(project, intruder), { members: 1, events: 0 });
  cases++; console.log('PASS another owner protected');
  await actor(a, null);
  await assert.rejects(remove(a, project, viewer, viewer), e => e.message === 'UNAUTHORIZED');
  await actor(a, null, 'anon');
  await assert.rejects(remove(a, project, viewer, viewer), e => e.code === '42501');
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  cases++; console.log('PASS null auth/anon denied');
  await actor(a, viewer);
  assert.equal((await a.query('DELETE FROM project_members WHERE project_id=$1 AND user_id=$2', [project, editor])).rowCount, 0);
  assert.equal((await a.query("UPDATE project_members SET role='owner' WHERE project_id=$1 AND user_id=$2", [project, viewer])).rowCount, 0);
  cases++; console.log('PASS direct cross-member deletion and role escalation denied by original RLS');

  await reset(); await actor(a, viewer);
  await db.query("ALTER TABLE project_activity_events ADD CONSTRAINT reject_test_event CHECK (event_type <> 'member_removed')");
  await assert.rejects(remove(a, project, viewer, viewer), e => e.code === '23514');
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  await db.query('ALTER TABLE project_activity_events DROP CONSTRAINT reject_test_event');
  cases++; console.log('PASS event failure leaves membership unchanged');

  await db.query(`CREATE FUNCTION reject_test_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test deletion failure'; END $$;
    CREATE TRIGGER reject_test_delete BEFORE DELETE ON project_members FOR EACH ROW EXECUTE FUNCTION reject_test_delete()`);
  await assert.rejects(remove(a, project, viewer, viewer), e => e.message === 'test deletion failure');
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  await db.query('DROP TRIGGER reject_test_delete ON project_members; DROP FUNCTION reject_test_delete()');
  cases++; console.log('PASS delete failure rolls back already-inserted event');

  await a.query('BEGIN');
  await remove(a, project, viewer, viewer);
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  await a.query('ROLLBACK');
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  cases++; console.log('PASS caller transaction rollback restores membership and event');

  // Hold the target row using a third connection, then observe both real backend
  // connections waiting in DELETE before releasing them. No JavaScript mutex.
  for (const [label, secondActor] of [['duplicate leave', viewer], ['owner remove versus leave', owner]]) {
    await reset(); await actor(a, viewer); await actor(b, secondActor);
    const apid = (await a.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const bpid = (await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await db.query('BEGIN');
    await db.query('SELECT * FROM project_members WHERE project_id=$1 AND user_id=$2 FOR UPDATE', [project, viewer]);
    const results = [remove(a, project, viewer, viewer), remove(b, project, viewer, secondActor)].map(p => p.then(() => ({ ok: true }), e => ({ ok: false, code: e.code, message: e.message })));
    const deadline = Date.now() + 3000;
    let waiting = false;
    while (Date.now() < deadline) {
      const locks = await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [[apid, bpid]]);
      if (locks.rows[0].n === 2) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
      await db.query('SELECT pg_stat_clear_snapshot()');
    }
    await db.query('COMMIT');
    const outcomes = await Promise.all(results);
    assert.equal(waiting, true, 'both separate connections must actually overlap and wait on SQL locks');
    assert.equal(outcomes.filter(r => r.ok).length, 1);
    assert.deepEqual(outcomes.filter(r => !r.ok).map(r => r.message), ['PROJECT_MEMBER_NOT_FOUND']);
    assert.deepEqual(await counts(project, viewer), { members: 0, events: 1 });
    cases++; console.log(`PASS ${label}: connections ${apid}/${bpid}, one removal/event, losing transaction rolled back`);
  }
  await reset(); await actor(a, viewer); await actor(b, owner);
  await b.query('BEGIN');
  await b.query("UPDATE project_members SET role='owner' WHERE project_id=$1 AND user_id=$2", [project, viewer]);
  const leavingPid = (await a.query('SELECT pg_backend_pid() pid')).rows[0].pid;
  const leaving = remove(a, project, viewer, viewer).then(() => null, error => error.message);
  let blockedOnPromotion = false;
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const state = await db.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [leavingPid]);
    if (state.rows[0].wait_event_type === 'Lock') { blockedOnPromotion = true; break; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await b.query('COMMIT');
  assert.equal(await leaving, 'PROJECT_MEMBER_NOT_FOUND');
  assert.equal(blockedOnPromotion, true);
  assert.deepEqual(await counts(project, viewer), { members: 1, events: 0 });
  assert.equal((await db.query('SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2', [project, viewer])).rows[0].role, 'owner');
  cases++; console.log('PASS concurrent owner promotion prevents delete and rolls back activity');
  console.log(`PASS ${cases} SQL cases`);
}, { toolingRoot }).catch(error => { console.error(error); process.exitCode = 1; });
