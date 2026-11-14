import { DelimitationRepo } from '@/src/modules/delimitation/delimitation.repo';
import { DelimitationService } from '@/src/modules/delimitation/delimitation.service';
import { ResearchDesignRepo } from '@/src/modules/research-design/research-design.repo';
import { ResearchDesignService } from '@/src/modules/research-design/research-design.service';
import { SampleConfigRepo } from '@/src/modules/sample-config/sample-config.repo';
import { SampleConfigService } from '@/src/modules/sample-config/sample-config.service';
import { workflowDatabaseError, workflowRpc } from '@/src/modules/security/workflow-transactions';

describe('workflow transaction unmapped and malformed errors',()=>{
  it.each([undefined,'not JSON'])('redacts missing or malformed conflict details %j',details=>{expect(workflowDatabaseError({code:'P0001',message:'WORKFLOW_REVISION_CONFLICT',details},'research-design')).toMatchObject({status:409,code:'RESEARCH_DESIGN_REVISION_CONFLICT',latest:null});});
  it.each([null,{code:'P0001',message:'OTHER_DOMAIN_MARKER'},{code:'23505',message:'Unique'}])('preserves unrecognized error identity %j',error=>{expect(workflowDatabaseError(error,'delimitation')).toBe(error);});
  it('rejects an unmapped RPC error without retrying',async()=>{const error={code:'P0001',message:'OTHER_DOMAIN_MARKER'};const rpc=jest.fn().mockResolvedValue({data:null,error,status:400});await expect(workflowRpc({rpc} as never,'sample-config','save_workflow_snapshot',{p_project_id:'transaction-project'})).rejects.toEqual({...error,status:400});expect(rpc).toHaveBeenCalledTimes(1);});
});

const cases = [
  ['delimitation', DelimitationRepo, (repo: never, revision: number | undefined) => new DelimitationService(repo).restoreVersion('project','version','actor', { base_revision: revision }), 'DELIMITATION_REVISION_CONFLICT'],
  ['research-design', ResearchDesignRepo, (repo: never, revision: number | undefined) => new ResearchDesignService(repo).restoreVersion('project','version',{ base_revision: revision },{actorUserId:'actor'}), 'RESEARCH_DESIGN_REVISION_CONFLICT'],
  ['sample-config', SampleConfigRepo, (repo: never, revision: number | undefined) => new SampleConfigService(repo).restoreVersion('project','version',{ base_revision: revision },{actorUserId:'actor'}), 'SAMPLE_CONFIG_REVISION_CONFLICT'],
] as const;

describe.each(cases)('%s transactional restore boundary', (workflow, Repo, restore, conflictCode) => {
  const parent = { project_id: 'project', revision: 8, topic:'Target',research_question:'Target',field_phase:'Target' };
  const target = {version:{id:'version',project_id:'project',version_number:1,trigger_type:'manual'},children:[]};
  const response = { target,backup:null,backup_created:false,parent,children:[] };
  function setup(result: unknown) {
    const query: Record<string, jest.Mock> = {};
    for (const key of ['select','eq','order','limit','insert','update','delete','is']) query[key] = jest.fn().mockReturnValue(query);
    query.maybeSingle = jest.fn().mockResolvedValue({data:{...parent,revision:7},error:null});
    query.single = jest.fn().mockResolvedValue({data:{...parent,revision:7},error:null});
    // Participant query is intentionally outside the workflow transaction.
    const db = {rpc:jest.fn().mockResolvedValue(result),from:jest.fn().mockImplementation((table:string) => table === 'project_participants' ? {select:()=>({eq:()=>({is:()=>({order:()=>({order:()=>Promise.resolve({data:[],error:null})})})})})} : query)};
    return {db,repo:new Repo(db as never)};
  }
  it('passes the explicit displayed revision and returns only the committed RPC workflow state',async()=>{
    const {db,repo} = setup({data:response,error:null});
    const result = await restore(repo as never,7);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('restore_workflow_version',{p_workflow:workflow,p_project_id:'project',p_version_id:'version',p_actor_id:'actor',p_expected_revision:7,p_create_backup:true});
    expect(JSON.stringify(result)).toContain('"revision":8');
    expect(JSON.stringify(result)).toContain('"id":"version"');
  });
  it('uses a server-observed revision only for legacy omitted input',async()=>{
    const {db,repo}=setup({data:response,error:null});
    await restore(repo as never,undefined);
    expect(db.rpc).toHaveBeenCalledWith('restore_workflow_version', expect.objectContaining({p_expected_revision:7}));
  });
  it.each([
    ['WORKFLOW_REVISION_CONFLICT',409],['WORKFLOW_WRITE_CONFLICT',409],['WORKFLOW_VERSION_NOT_FOUND',404],['WORKFLOW_FORBIDDEN',403],
  ])('maps %s without leaking SQL diagnostics',async(marker,status)=>{
    const {repo}=setup({data:null,error:{code:'P0001',message:marker,details:JSON.stringify(parent),hint:'secret'},status:400});
    await expect(restore(repo as never,7)).rejects.toMatchObject({status,message:marker==='WORKFLOW_REVISION_CONFLICT'?conflictCode:marker==='WORKFLOW_VERSION_NOT_FOUND'?(workflow==='delimitation'?'VERSION_NOT_FOUND':workflow==='research-design'?'RESEARCH_DESIGN_VERSION_NOT_FOUND':'SAMPLE_CONFIG_VERSION_NOT_FOUND'):marker==='WORKFLOW_FORBIDDEN'?'Forbidden':marker});
  });
  it('redacts provider HTTP503 and never retries the write',async()=>{
    const {db,repo}=setup({data:null,error:{message:'upstream secret'},status:503});
    await expect(restore(repo as never,7)).rejects.toMatchObject({status:503,message:'DEPENDENCY_UNAVAILABLE'});
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });
  it('preserves backup identity with a nullable server hash in the existing response envelope',async()=>{
    const backup={version:{...target.version,id:'backup',content_hash:null,trigger_type:'restore_backup'},children:[],created:false};
    const {repo}=setup({data:{...response,backup},error:null});
    const restored=await restore(repo as never,7);
    expect(JSON.stringify(restored)).toContain('"id":"backup"');
    expect(JSON.stringify(restored)).toContain('"content_hash":null');
    if ('backupCreated' in restored) expect(restored.backupCreated).toBe(false);
    if ('backup_created' in restored) expect(restored.backup_created).toBe(false);
  });
  it('maps busy ordinary writes safely rather than leaking the SQL marker diagnostics',async()=>{
    const q:Record<string,jest.Mock>={};
    for(const name of ['insert','select'])q[name]=jest.fn().mockReturnValue(q);
    q.single=jest.fn().mockResolvedValue({data:null,error:{code:'P0001',message:'WORKFLOW_WRITE_CONFLICT',details:'private'},status:400});
    const repo=new Repo({from:()=>q} as never);
    const operation=workflow==='delimitation'
      ? (repo as DelimitationRepo).createItem('project',{kind:'include',text:'New'})
      : workflow==='research-design'
        ? (repo as ResearchDesignRepo).createResearchDesign('project',{research_question:'New'},'actor')
        : (repo as SampleConfigRepo).createSampleConfig('project',{field_phase:'New'},'actor');
    await expect(operation).rejects.toMatchObject({status:409,message:'WORKFLOW_WRITE_CONFLICT'});
  });
});

it('orders later delimitation reads by persisted position before timestamp and id',async()=>{
  const orders:string[]=[];
  const query={select:()=>query,eq:()=>query,order:(name:string)=>{orders.push(name);return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(resolve)};
  // This is the query emitted by the child-read half of later getFull requests.
  await new DelimitationRepo({from:()=>query} as never).getItems('project');
  expect(orders).toEqual(['position','created_at','id']);
});

describe.each([
  ['research-design',ResearchDesignRepo,['getSpecificObjectives','getVersionItems','getVersionItemsForVersions']],
  ['sample-config',SampleConfigRepo,['getCollectionTechniques','getVersionTechniques','getVersionTechniquesForVersions']],
] as const)('%s persisted tied-position reads',(workflow,Repo,methods)=>{
  it.each(methods)('%s uses the persisted tie-breaker without renumbering positions',async method=>{
    const orders:Array<[string,unknown]>=[];
    const rows=[{position:7,text:'Zeta',custom_label:'Zeta'},{position:7,text:'Árbol!',custom_label:'Árbol!'}];
    const query={select:()=>query,eq:()=>query,in:()=>query,order:(name:string,options:unknown)=>{orders.push([name,options]);return query;},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve)};
    const repo=new Repo({from:()=>query} as never);
    const result=await (repo[method as keyof typeof repo] as (value:never)=>Promise<unknown>)(method.endsWith('ForVersions')?['version'] as never:'project' as never);
    const expected=method.endsWith('ForVersions')?['version_id','position','workflow_order','created_at','id']:['position','workflow_order','created_at','id'];
    expect(orders.map(x=>x[0])).toEqual(expected);
    expect(orders.find(x=>x[0]==='workflow_order')?.[1]).toEqual({ascending:true,nullsFirst:true});
    expect(result).toEqual(rows);
  });
});
