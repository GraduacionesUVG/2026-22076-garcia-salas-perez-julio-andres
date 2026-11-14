import { ProjectsRepo } from '@/src/modules/projects/projects.repo';
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';

const project={id:'project-1',name:'Study',description:null,owner_id:'actor',is_active:true,created_at:'2026-01-01',updated_at:'2026-01-01'};
describe('ProjectsRepo installed SDK query boundaries',()=>{
  it('normalizes absent/array relations and joins profiles without losing missing members',async()=>{
    const db=createRecordedSupabase([
      {status:200,body:[{role:'owner',projects:[project]},{role:'viewer',projects:[]},{role:'editor',projects:null}]},
      {status:200,body:[{project_id:'project-1',user_id:'actor',role:'owner'},{project_id:'project-1',user_id:'missing',role:'viewer'}]},
      {status:200,body:[{id:'actor',full_name:'Ana',username:'ana'}]},
    ]);
    const rows=await new ProjectsRepo(db.client as never).listForUser('actor');
    expect(rows).toEqual([{role:'owner',projects:{...project,members:[{user_id:'actor',role:'owner',full_name:'Ana',username:'ana'},{user_id:'missing',role:'viewer',full_name:null,username:null}]}},{role:'viewer',projects:null},{role:'editor',projects:null}]);
    expect(db.requests[0].url.searchParams.get('user_id')).toBe('eq.actor');
    expect(db.requests[1].url.searchParams.get('project_id')).toBe('in.(project-1)');
    expect(db.requests[2].url.searchParams.get('id')).toBe('in.(actor,missing)'); db.assertDrained();
  });
  it.each([null,[],[{role:'viewer',projects:null}]])('avoids enrichment requests for absent projects %#',async body=>{
    const db=createRecordedSupabase([{status:200,body}]);
    expect(await new ProjectsRepo(db.client as never).listForUser('actor')).toEqual(body ?? []); db.assertDrained();
  });
  it('writes only supplied project fields and filters membership by project AND user',async()=>{
    const db=createRecordedSupabase([{status:201,body:project},{status:200,body:{role:'editor'}},{status:200,body:project},{status:200,body:project},{status:204,body:null}]);
    const repo=new ProjectsRepo(db.client as never);
    expect(await repo.createForOwner({ownerId:'actor',input:{name:'Study',is_active:false}})).toEqual(project);
    expect(await repo.getMembershipRole('project-1','actor')).toBe('editor');
    expect(await repo.getById('project-1')).toEqual(project);
    expect(await repo.updateById('project-1',{description:null,is_active:false})).toEqual(project);
    await repo.deleteById('project-1');
    expect(db.requests[0].body).toEqual({name:'Study',description:null,owner_id:'actor',is_active:false});
    expect(db.requests[1].url.searchParams.get('project_id')).toBe('eq.project-1'); expect(db.requests[1].url.searchParams.get('user_id')).toBe('eq.actor');
    expect(db.requests[3].body).toEqual({description:null,is_active:false});
    for(const index of [2,3,4]) expect(db.requests[index].url.searchParams.get('id')).toBe('eq.project-1'); db.assertDrained();
  });
  it.each(['create','membership','get','update','delete','list'] as const)('redacts %s transport failure without retry',async method=>{
    const db=createRecordedSupabase([{status:503,body:{message:'private provider'}}]); const repo=new ProjectsRepo(db.client as never);
    const operation=()=>({create:()=>repo.createForOwner({ownerId:'actor',input:{name:'Study'}}),membership:()=>repo.getMembershipRole('p','u'),get:()=>repo.getById('p'),update:()=>repo.updateById('p',{name:'Edit'}),delete:()=>repo.deleteById('p'),list:()=>repo.listForUser('u')})[method]();
    await expect(operation()).rejects.toMatchObject({status:503,message:'DEPENDENCY_UNAVAILABLE'}); expect(db.requests).toHaveLength(1); db.assertDrained();
  });
});
