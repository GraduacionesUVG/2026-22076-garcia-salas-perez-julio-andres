// Offline authenticated PostgreSQL regression. Explicit catalog/tooling/migration inputs only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { withLocalPostgres, installTeamCatalog } from './local-postgres.mjs';

const [toolingRoot, catalogDir, migration] = process.argv.slice(2);
const rows = name => {
  const s = JSON.parse(JSON.parse(fs.readFileSync(path.join(catalogDir, `catalog-${name}.json`))).content[0].text).result;
  return JSON.parse(s.slice(s.indexOf('[{'), s.lastIndexOf('}]') + 2));
};
const workflows = [
  { name: 'delimitation', parent: 'project_delimitation', child: 'project_delimitation_items', versions: 'project_delimitation_versions', items: 'project_delimitation_version_items', field: 'topic', childField: 'text', item: { kind: 'include', text: 'Zeta' } },
  { name: 'research-design', parent: 'project_research_design', child: 'project_specific_objectives', versions: 'project_research_design_versions', items: 'project_research_design_version_items', field: 'research_question', childField: 'text', item: { text: 'Zeta' } },
  { name: 'sample-config', parent: 'project_sample_config', child: 'project_sample_collection_techniques', versions: 'project_sample_config_versions', items: 'project_sample_config_version_techniques', field: 'field_phase', childField: 'custom_label', item: { is_custom: true, custom_label: 'Zeta' } },
];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let failures = 0;
await withLocalPostgres(async ({ connect }) => {
  const db = await connect();
  await installTeamCatalog(db, { catalogDir });
  // External option tables only need referenced code keys. No option business rules are claimed.
  await db.query(`CREATE TYPE delimitation_item_kind AS ENUM ('include','exclude');
    CREATE TABLE sample_main_approach_options(code text PRIMARY KEY);
    CREATE TABLE sample_scope_options(code text PRIMARY KEY);
    CREATE TABLE sample_collection_technique_options(code text PRIMARY KEY);`);
  const tables = workflows.flatMap(w => [w.parent, w.child, w.versions, w.items]);
  for (const table of tables) {
    const columns = rows('columns').filter(r => r.table_name === table).map(r => `${r.column_name} ${r.column_type}${r.not_null ? ' NOT NULL' : ''}${r.default_value ? ` DEFAULT ${r.default_value}` : ''}`);
    await db.query(`CREATE TABLE public.${table} (${columns.join(',')})`);
  }
  for (const table of tables) {
    for (const c of rows('constraints').filter(r => r.table_name === table)) await db.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${c.conname} ${c.definition}`);
    await db.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    for (const p of rows('policies').filter(r => r.tablename === table)) await db.query(`CREATE POLICY ${p.policyname} ON public.${table} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.slice(1, -1)}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''}`);
    for (const g of rows('grants').filter(r => r.table_name === table)) await db.query(`GRANT ${g.privilege_type} ON public.${table} TO ${g.grantee}`);
    for (const t of rows('triggers').filter(r => r.table_name === table)) { await db.query(t.function_definition); await db.query(t.definition); }
  }
  await db.query('INSERT INTO projects VALUES ($1)',[id(99)]);
  await db.query("INSERT INTO project_delimitation_items(id,project_id,kind,text,created_at,updated_at) VALUES ($1,$3,'include','Legacy first','2000-01-01','2000-01-02'),($2,$3,'include','Legacy second','2000-01-01','2000-01-02')",[id(91),id(92),id(99)]);
  for(const [index,w] of workflows.entries()) {
    if(w.name==='delimitation')continue;
    await db.query(`INSERT INTO ${w.versions}(id,project_id,version_number) VALUES ($1,$2,1)`,[id(95+index),id(99)]);
    for(const [n,label] of ['Legacy first','Legacy second'].entries()) {
      const item={...w.item,[w.childField]:label,position:7},keys=Object.keys(item),params=keys.map((_,i)=>`$${i+3}`).join(',');
      await db.query(`INSERT INTO ${w.child}(id,project_id,${keys.join(',')},created_at,updated_at) VALUES ($1,$2,${params},'2000-01-01','2000-01-02')`,[id(500+index*10+n),id(99),...Object.values(item)]);
      await db.query(`INSERT INTO ${w.items}(id,version_id,${keys.join(',')},created_at) VALUES ($1,$2,${params},'2000-01-01')`,[id(600+index*10+n),id(95+index),...Object.values(item)]);
    }
  }
  if (migration !== '-') {
    await db.query(fs.readFileSync(migration, 'utf8'));
    assert.ok((await db.query("SELECT 1 FROM project_delimitation_items WHERE project_id=$1 AND updated_at<>'2000-01-02'::timestamptz",[id(99)])).rowCount===0,'migration must not rewrite legacy audit timestamps');
    await db.query("INSERT INTO project_delimitation_items(project_id,kind,text) VALUES ($1,'include','Appended')",[id(99)]);
    assert.deepEqual((await db.query('SELECT text FROM project_delimitation_items WHERE project_id=$1 ORDER BY position NULLS FIRST,created_at,id',[id(99)])).rows.map(x=>x.text),['Legacy first','Legacy second','Appended']);
    for(const [index,w] of workflows.entries()) {
      if(w.name==='delimitation')continue;
      for(const [table,key,value] of [[w.child,'project_id',id(99)],[w.items,'version_id',id(95+index)]]) {
        const legacy=(await db.query(`SELECT ${w.childField} label,position,workflow_order,created_at='2000-01-01'::timestamptz created FROM ${table} WHERE ${key}=$1 ORDER BY position,workflow_order NULLS FIRST,created_at,id`,[value])).rows;
        assert.deepEqual(legacy.map(x=>[x.label,x.position,x.workflow_order,x.created]),[['Legacy first',7,null,true],['Legacy second',7,null,true]]);
      }
      assert.equal((await db.query(`SELECT 1 FROM ${w.child} WHERE project_id=$1 AND updated_at<>'2000-01-02'::timestamptz`,[id(99)])).rowCount,0);
    }
  }
  if (migration !== '-') {
    const privileges=(await db.query("SELECT prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated FROM pg_proc WHERE proname IN ('restore_workflow_version','save_workflow_snapshot')")).rows;
    assert.equal(privileges.length,2);
    for(const p of privileges){assert.equal(p.prosecdef,false);assert.equal(p.anon,false);assert.equal(p.authenticated,true);assert.ok(p.proconfig.some(x=>x.startsWith('search_path=')));}
  }
  for (const n of [1,2,3,4]) { await db.query('INSERT INTO auth.users VALUES ($1)', [id(n)]); await db.query('INSERT INTO profiles VALUES ($1)', [id(n)]); }
  async function actor(n) { const c = await connect(); await c.query('SET ROLE authenticated'); await c.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id(n)]); return c; }
  const owner = await actor(1), editor = await actor(2), viewer = await actor(3), outsider = await actor(4);
  // Deterministic I1 reproduction: replacement UUIDs sort opposite INSERT order,
  // while now() gives all copied rows the same timestamp. No probabilistic UUID test.
  await db.query(`CREATE SEQUENCE test_reverse_ids START 999999 INCREMENT -1 MINVALUE 1 MAXVALUE 999999;
    GRANT USAGE ON SEQUENCE test_reverse_ids TO authenticated;
    CREATE FUNCTION test_reverse_uuid() RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-' || lpad(nextval('test_reverse_ids')::text,12,'0'))::uuid $$`);
  for (const [index,w] of workflows.entries()) {
    if(w.name==='delimitation') continue;
    for(const table of [w.child,w.items])await db.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT test_reverse_uuid()`);
    for(const [scenarioIndex,scenario] of ['manual','backup','restore'].entries()) {
      const project=id(6000+index*10+scenarioIndex),target=id(7000+index*10+scenarioIndex);
      try {
        await db.query('INSERT INTO projects VALUES ($1)',[project]);
        for(const [n,role] of [[1,'owner'],[2,'editor']])await db.query('INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,$3)',[project,id(n),role]);
        await db.query(`INSERT INTO ${w.parent}(project_id,${w.field},revision) VALUES ($1,$2,7)`,[project,`Tied ${scenario}`]);
        await db.query(`INSERT INTO ${w.versions}(id,project_id,version_number,snapshot_${w.field}) VALUES ($1,$2,1,'Target ties')`,[target,project]);
        const ordered=[{...w.item,[w.childField]:'Zeta',position:7},{...w.item,[w.childField]:'Árbol!',position:7}];
        for(const [n,item] of ordered.entries()) {
          const keys=Object.keys(item),placeholders=keys.map((_,i)=>`$${i+3}`).join(',');
          await db.query(`INSERT INTO ${w.child}(id,project_id,${keys.join(',')},created_at) VALUES ($1,$2,${placeholders},'2000-01-01')`,[id(8000+index*100+scenarioIndex*10+n),project,...Object.values(item)]);
          await db.query(`INSERT INTO ${w.items}(id,version_id,${keys.join(',')},created_at) VALUES ($1,$2,${placeholders},'2000-01-01')`,[id(9000+index*100+scenarioIndex*10+n),target,...Object.values(item)]);
        }
        const snapshot={...(await owner.query('SELECT workflow_spec($1) AS spec',[w.name])).rows[0].spec.defaults,[w.field]:`Tied ${scenario}`};
        let version,expectSnapshot;
        if(scenario==='manual') {
          const saved=(await owner.query("SELECT save_workflow_snapshot($1,$2,$3,$4,$5,NULL,'manual',$6) AS result",[w.name,project,id(1),snapshot,JSON.stringify(ordered),`tied-${w.name}`])).rows[0].result;
          version=saved.version;expectSnapshot=snapshot;
        } else {
          const restored=(await owner.query('SELECT restore_workflow_version($1,$2,$3,$4,7,true) AS result',[w.name,project,target,id(1)])).rows[0].result;
          assert.ok(restored.children.every(child=>!('workflow_order' in child)));
          version=scenario==='backup'?restored.backup.version:restored.target.version;
          expectSnapshot=scenario==='backup'?snapshot:{...snapshot,[w.field]:'Target ties'};
        }
        // Separate authenticated read, using each production ordering contract (legacy fallback
        // supported before the migration gains a tie column). Never assert only immediate RPC data.
        const table=scenario==='restore'?w.child:w.items,key=scenario==='restore'?'project_id':'version_id';
        const later=(await editor.query(`SELECT ${w.childField} label,position FROM ${table} t WHERE ${key}=$1 ORDER BY position,(to_jsonb(t)->>'workflow_order')::bigint NULLS FIRST,created_at,id`,[scenario==='restore'?project:version.id])).rows;
        assert.deepEqual(later,[{label:'Zeta',position:7},{label:'Árbol!',position:7}]);
        const duplicate=(await owner.query("SELECT save_workflow_snapshot($1,$2,$3,$4,$5,NULL,'manual','same-content-different-digest') AS result",[w.name,project,id(1),expectSnapshot,JSON.stringify(ordered)])).rows[0].result;
        assert.equal(duplicate.created,false);assert.equal(duplicate.version.id,version.id);
        assert.equal(duplicate.version.content_hash,version.content_hash);
        assert.ok(duplicate.children.every(child=>!('workflow_order' in child)));
        const swapped=(await owner.query("SELECT save_workflow_snapshot($1,$2,$3,$4,$5,NULL,'manual',NULL) AS result",[w.name,project,id(1),expectSnapshot,JSON.stringify([...ordered].reverse())])).rows[0].result;
        assert.equal(swapped.created,true,'tied-position order remains part of research/sample identity');
        assert.notEqual(swapped.version.id,version.id);
        console.log(`PASS ${w.name} tied positions: ${scenario}, independent later order, numeric positions and dedupe identity`);
      } catch(error) {failures++;console.error(`FAIL ${w.name} tied positions ${scenario}: ${error.message}`);}
      finally {for(const c of [owner,editor,db])await c.query('ROLLBACK');}
    }
    for(const table of [w.child,w.items])await db.query(`ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT gen_random_uuid()`);
  }
  for (const [index, w] of workflows.entries()) {
    const project = id(100 + index), target = id(200 + index);
    try {
      await db.query('INSERT INTO projects VALUES ($1)', [project]);
      for (const [n, role] of [[1,'owner'],[2,'editor'],[3,'viewer']]) await db.query('INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,$3)', [project,id(n),role]);
      await db.query(`INSERT INTO ${w.parent}(project_id,${w.field},revision) VALUES ($1,'Changed',7)`, [project]);
      await db.query(`INSERT INTO ${w.versions}(id,project_id,version_number,snapshot_${w.field}) VALUES ($1,$2,1,'Target')`, [target, project]);
      for (const [position, label] of [[0,'Zeta'],[1,'Árbol!']]) {
        const item = { ...w.item, [w.childField]: label };
        const keys = Object.keys(item);
        await db.query(`INSERT INTO ${w.items}(version_id,position,${keys.join(',')}) VALUES ($1,$2,${keys.map((_,i)=>`$${i+3}`).join(',')})`, [target,position,...Object.values(item)]);
      }
      const call = (c, revision = 7, version = target, actorId = id(1)) => c.query('SELECT restore_workflow_version($1,$2,$3,$4,$5,true) AS result', [w.name,project,version,actorId,revision]);
      const result = (await call(owner)).rows[0].result;
      assert.equal(result.parent.revision, 8);
      assert.deepEqual(result.children.map(x=>x[w.childField]), ['Zeta','Árbol!']);
      const read = async () => {
        const state = {};
        for (const table of [w.parent,w.child,w.versions,w.items]) state[table]=(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
        return state;
      };
      const before = await read();
      await assert.rejects(call(owner,7), /WORKFLOW_REVISION_CONFLICT/);
      await assert.rejects(call(owner,8,id(999)), /WORKFLOW_VERSION_NOT_FOUND/);
      for (const [client,n] of [[viewer,3],[outsider,4]]) await assert.rejects(call(client,8,target,id(n)), /WORKFLOW_FORBIDDEN/);
      await assert.rejects(call(owner,8,target,id(2)), /WORKFLOW_FORBIDDEN/);
      await assert.rejects(call(owner,8,target,null), /WORKFLOW_FORBIDDEN/);
      await outsider.query('SET ROLE anon');
      await assert.rejects(call(outsider,8,target,id(4)), /permission denied for function restore_workflow_version/);
      await outsider.query('SET ROLE authenticated');
      assert.equal((await outsider.query(`SELECT 1 FROM ${w.parent} WHERE project_id=$1`,[project])).rowCount,0);
      assert.equal((await viewer.query(`SELECT 1 FROM ${w.parent} WHERE project_id=$1`,[project])).rowCount,1);
      assert.deepEqual(await read(),before);
      const later=(await owner.query(`SELECT ${w.childField} label FROM ${w.child} WHERE project_id=$1 ORDER BY position,created_at,id`,[project])).rows.map(x=>x.label);
      assert.deepEqual(later,['Zeta','Árbol!']);
      const backup=(await owner.query('SELECT workflow_version_data($1,$2,$3) AS data',[w.name,project,result.backup.version.id])).rows[0].data;
      assert.equal(backup.snapshot[w.field],'Changed');assert.deepEqual(backup.children,[]);
      assert.equal(backup.version.content_hash,null);
      const snapshot = async (snapshot, children, hash='manual-js-hash', projectId=project) => (await owner.query('SELECT save_workflow_snapshot($1,$2,$3,$4,$5,NULL,\'manual\',$6) AS result',[w.name,projectId,id(1),snapshot,JSON.stringify(children),hash])).rows[0].result;
      const manualDuplicate=await snapshot(backup.snapshot,backup.children);
      assert.equal(manualDuplicate.created,false); assert.equal(manualDuplicate.version.id,backup.version.id);
      assert.equal(manualDuplicate.version.content_hash,null);
      // A manual JS digest remains byte-for-byte unchanged when structural backup dedupe finds it.
      const targetData=(await owner.query('SELECT workflow_version_data($1,$2,$3) AS data',[w.name,project,target])).rows[0].data;
      const manualSnapshot={...targetData.snapshot,[w.field]:'\u00a0Manual\t'};
      const manual=await snapshot(manualSnapshot,[],'historical-javascript-digest');
      await owner.query(`UPDATE ${w.parent} SET ${w.field}='Manual' WHERE project_id=$1`,[project]);
      await owner.query(`DELETE FROM ${w.child} WHERE project_id=$1`,[project]);
      let revision=Number((await owner.query(`SELECT revision FROM ${w.parent} WHERE project_id=$1`,[project])).rows[0].revision);
      const deduped=(await call(owner,revision)).rows[0].result;
      assert.equal(deduped.backup_created,false);assert.equal(deduped.backup.version.id,manual.version.id);
      assert.equal(deduped.backup.version.content_hash,'historical-javascript-digest');
      // Normalization + delimiter multiset identity do not depend on SQL/Node collation equivalence.
      const normalizedChildren=targetData.children.map((x,i)=>({...x,[w.childField]:i===0?'  Zeta\u00a0':'\tÁrbol!  '}));
      const equivalent=await snapshot(targetData.snapshot,w.name==='delimitation'?normalizedChildren.reverse():normalizedChildren);
      assert.equal(equivalent.created,false);assert.equal(equivalent.version.id,target);
      if(w.name==='delimitation') {
        const lineSnapshot={...targetData.snapshot,topic:' \r\nLines\r\nnext\uFEFF'};
        const lines=await snapshot(lineSnapshot,[{kind:'include',text:'a!\r\nb',position:0}],'line-ending-digest');
        const normalized=await snapshot({...lineSnapshot,topic:'Lines\nnext'},[{kind:'include',text:'a!\nb',position:9}]);
        assert.equal(normalized.created,false);assert.equal(normalized.version.id,lines.version.id);
      }
      // Full rollback: fail after backup/parent/delete, when inserting replacement children.
      await db.query(`CREATE OR REPLACE FUNCTION test_fail_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.fail_restore',true)='yes' THEN RAISE EXCEPTION 'INJECTED_CHILD_FAILURE'; END IF; RETURN NEW; END $$`);
      await db.query(`CREATE TRIGGER zzz_test_failure BEFORE INSERT ON ${w.child} FOR EACH ROW EXECUTE FUNCTION test_fail_restore()`);
      await owner.query(`UPDATE ${w.parent} SET ${w.field}='Rollback unique' WHERE project_id=$1`,[project]);
      revision=Number((await owner.query(`SELECT revision FROM ${w.parent} WHERE project_id=$1`,[project])).rows[0].revision);
      const rollbackBefore=await read();
      await owner.query("SELECT set_config('test.fail_restore','yes',false)");
      await assert.rejects(call(owner,revision),/INJECTED_CHILD_FAILURE/);
      await owner.query("SELECT set_config('test.fail_restore','no',false)");
      assert.deepEqual(await read(),rollbackBefore);
      await db.query(`DROP TRIGGER zzz_test_failure ON ${w.child}`);
      const versionsBeforeRace=(await owner.query(`SELECT count(*) n FROM ${w.versions} WHERE project_id=$1`,[project])).rows[0].n;
      // Hold a real successful restore transaction open; the other connection must wait on its lock.
      await owner.query('BEGIN');
      const winner=(await call(owner,revision)).rows[0].result;
      const editorPid=(await editor.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const loser=call(editor,revision,target,id(2)).then(()=>({ok:true}),error=>({error}));
      let blocked=false;
      for(let attempt=0;attempt<100;attempt++) {
        const locks=(await db.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[editorPid])).rows;
        if(locks.length){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.equal(blocked,true,'separate RPC must overlap and block');
      await owner.query('COMMIT');
      assert.match((await loser).error?.message??'',/WORKFLOW_REVISION_CONFLICT/);
      assert.equal(winner.parent.revision,revision+1);
      assert.equal(winner.backup_created,true);
      assert.equal(Number((await owner.query(`SELECT count(*) n FROM ${w.versions} WHERE project_id=$1`,[project])).rows[0].n),Number(versionsBeforeRace)+1);
      assert.equal((await owner.query(`SELECT revision FROM ${w.parent} WHERE project_id=$1`,[project])).rows[0].revision,String(revision+1));
      // Child writer commits first: restore waits, then backs up the committed child it removes.
      await owner.query('BEGIN');
      await owner.query(`UPDATE ${w.child} SET ${w.childField}='Committed overlap' WHERE project_id=$1 AND position=0`,[project]);
      const pending=call(editor,revision+1,target,id(2)).then(value=>({value}),error=>({error}));
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.ok((await db.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[editorPid])).rowCount);
      await owner.query('COMMIT');
      const childOutcome=await pending;assert.ifError(childOutcome.error);
      const afterChild=childOutcome.value.rows[0].result;
      assert.equal(afterChild.backup.children[0][w.childField],'Committed overlap');
      assert.equal(afterChild.parent.updated_by,id(2));
      assert.ok(afterChild.children.every(c=>c.created_by===id(2) && c.updated_by===id(2)));
      // Hold the lock before row work (the window that would cause row/advisory inversion).
      // An UPDATE of an already locked tuple can wait BEFORE a row trigger; it then serializes
      // after commit/rechecks its predicate. We do not claim all writes fail immediately.
      await owner.query('BEGIN');
      await owner.query('SELECT pg_advisory_xact_lock(workflow_lock_key($1,$2))',[w.name,project]);
      for(const sql of [
        `UPDATE ${w.parent} SET ${w.field}='Lost' WHERE project_id=$1`,
        `UPDATE ${w.child} SET ${w.childField}='Lost' WHERE project_id=$1`,
        `UPDATE ${w.versions} SET label='Lost' WHERE project_id=$1`,
      ]) await assert.rejects(editor.query(sql,[project]),/WORKFLOW_WRITE_CONFLICT/);
      await assert.rejects(editor.query(`UPDATE ${w.items} SET position=position WHERE version_id=$1`,[target]),/WORKFLOW_WRITE_CONFLICT/);
      // Different project still writes successfully while this restore lock is held.
      const foreign=id(300+index),foreignVersion=id(400+index);
      await db.query('INSERT INTO projects VALUES ($1)',[foreign]);
      for(const [n,role] of [[1,'owner'],[2,'editor']])await db.query('INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,$3)',[foreign,id(n),role]);
      await editor.query(`INSERT INTO ${w.parent}(project_id,${w.field}) VALUES ($1,'Independent')`,[foreign]);
      await editor.query(`INSERT INTO ${w.versions}(id,project_id,version_number) VALUES ($1,$2,1)`,[foreignVersion,foreign]);
      await owner.query('ROLLBACK');
      await assert.rejects(call(owner,revision+2,foreignVersion),/WORKFLOW_VERSION_NOT_FOUND/);
      // Missing-parent serialization uses the same project lock, not a nonexistent tuple.
      await editor.query(`DELETE FROM ${w.parent} WHERE project_id=$1`,[foreign]);
      await assert.rejects(owner.query('SELECT restore_workflow_version($1,$2,$3,$4,1,false)',[w.name,foreign,foreignVersion,id(1)]),/WORKFLOW_REVISION_CONFLICT/);
      await owner.query('BEGIN');
      const emptyWinner=(await owner.query('SELECT restore_workflow_version($1,$2,$3,$4,0,false) AS result',[w.name,foreign,foreignVersion,id(1)])).rows[0].result;
      const emptyLoser=editor.query('SELECT restore_workflow_version($1,$2,$3,$4,0,false)',[w.name,foreign,foreignVersion,id(2)]).then(()=>({ok:true}),error=>({error}));
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.ok((await db.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[editorPid])).rowCount);
      await owner.query('COMMIT');
      assert.equal(emptyWinner.parent.revision,1);assert.equal(emptyWinner.backup,null);
      assert.match((await emptyLoser).error?.message??'',/WORKFLOW_REVISION_CONFLICT/);
      // Reverse lock order: writer owns a tuple first, restore owns advisory then waits.
      // The nonblocking write trigger breaks this potential deadlock by rejecting the writer.
      revision=Number((await owner.query(`SELECT revision FROM ${w.parent} WHERE project_id=$1`,[project])).rows[0].revision);
      await editor.query('BEGIN');
      await editor.query(`SELECT 1 FROM ${w.parent} WHERE project_id=$1 FOR UPDATE`,[project]);
      await owner.query('BEGIN');
      const ownerPid=(await owner.query('SELECT pg_backend_pid() pid')).rows[0].pid;
      const inverted=call(owner,revision).then(value=>({value}),error=>({error}));
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.ok((await db.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[ownerPid])).rowCount);
      await assert.rejects(editor.query(`UPDATE ${w.parent} SET ${w.field}='Must roll back' WHERE project_id=$1`,[project]),/WORKFLOW_WRITE_CONFLICT/);
      await editor.query('ROLLBACK');
      const invertedOutcome=await inverted;assert.ifError(invertedOutcome.error);
      assert.equal(invertedOutcome.value.rows[0].result.parent.revision,revision+1);
      await owner.query('COMMIT');
      // Restore tuple first: UPDATE waits before trigger, then rechecks its explicit revision.
      await owner.query('BEGIN');
      await call(owner,revision+1);
      const waitingUpdate=editor.query(`UPDATE ${w.parent} SET ${w.field}='Stale writer' WHERE project_id=$1 AND revision=$2`,[project,revision+1]).then(value=>({value}),error=>({error}));
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.ok((await db.query('SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted',[editorPid])).rowCount);
      await owner.query('COMMIT');
      const waited=await waitingUpdate;assert.ifError(waited.error);assert.equal(waited.value.rowCount,0);
      assert.equal((await owner.query(`SELECT ${w.field} value FROM ${w.parent} WHERE project_id=$1`,[project])).rows[0].value,'Target');
      console.log(`PASS ${w.name}: auth/foreign/missing/stale unchanged; exact later order; backup readback; manual↔backup dedupe; Unicode normalization; rollback all4tables; forced restore/child overlap; ordinary busy writes; distinct-project progress; missing-parent race`);
    } catch (error) { failures++; console.error(`FAIL ${w.name}: ${error.message}`); }
    finally { for(const c of [owner,editor,viewer,outsider,db]) await c.query('ROLLBACK'); }
  }
}, { toolingRoot });
if (failures) throw new Error(`${failures} independent workflow regressions failed`);
