import { POST as delimitation } from '@/app/api/projects/[id]/delimitation/versions/[versionId]/restore/route';
import { POST as research } from '@/app/api/projects/[id]/research-design/versions/[versionId]/restore/route';
import { POST as sample } from '@/app/api/projects/[id]/sample-config/versions/[versionId]/restore/route';
import { requireProjectRole } from '@/src/modules/projects/project.guard';
jest.mock('@/src/modules/projects/project.guard',()=>({requireProjectRole:jest.fn()}));
const project='00000000-0000-4000-8000-000000000001',version='00000000-0000-4000-8000-000000000002';
const ctx={params:Promise.resolve({id:project,versionId:version})};
beforeEach(()=>jest.clearAllMocks());
describe.each([['delimitation',delimitation,'latest_delimitation'],['research-design',research,'latest_design'],['sample-config',sample,'latest_config']] as const)('%s restore HTTP', (workflow,post,latestKey)=>{
  function setup(result: unknown,actor=project) {
    const query: Record<string,jest.Mock>={};
    for(const key of ['select','eq','is','order'])query[key]=jest.fn().mockReturnValue(query);
    query.maybeSingle=jest.fn().mockResolvedValue({data:{revision:12},error:null});
    query.then=jest.fn().mockImplementation((resolve)=>Promise.resolve({data:[],error:null}).then(resolve));
    const rpc=jest.fn().mockResolvedValue(result);
    jest.mocked(requireProjectRole).mockResolvedValue({supabase:{rpc,from:()=>query},user:{id:actor}} as never);
    return rpc;
  }
  it('returns committed success state with exact actor/revision/backup RPC input',async()=>{
    const actor='00000000-0000-4000-8000-000000000003';
    const parent={project_id:project,revision:1,topic:'Restored',research_question:'Restored',field_phase:'Restored'};
    const target={version:{id:version,project_id:project,version_number:2,trigger_type:'manual'},children:[]};
    const rpc=setup({data:{parent,children:[],target,backup:null,backup_created:false},error:null},actor);
    const response=await post(new Request('http://local',{method:'POST',body:JSON.stringify({base_revision:0,create_backup_of_current:false})}),ctx);
    expect(response.status).toBe(200);const body=await response.json();expect(body.ok).toBe(true);
    const restored=workflow==='delimitation'?body.data:body.restored;
    if(workflow==='delimitation')expect(restored).toEqual({restoredFromVersion:target.version,backupVersion:null,backupCreated:false,current:{delim:parent,include:[],exclude:[]}});
    else if(workflow==='research-design')expect(restored).toEqual({restored_from_version:target.version,backup_version:null,data:{design:parent,specific_objectives:[]}});
    else expect(restored).toMatchObject({restored_from_version:{id:version,version_number:2},backup_version:null,backup_created:false,current:{config:{...parent,actual_sample_size:0},collection_techniques:[],participant_groups:[]}});
    expect(requireProjectRole).toHaveBeenCalledWith(project,['owner','editor']);expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('restore_workflow_version',{p_workflow:workflow,p_project_id:project,p_version_id:version,p_actor_id:actor,p_expected_revision:0,p_create_backup:false});
  });
  it.each([{base_revision:-1},{base_revision:1.5},{base_revision:'3'},{create_backup_of_current:'yes'},{unknown:true}])('rejects invalid restore input %j',async body=>{
    const rpc=setup({data:null,error:null});
    const response=await post(new Request('http://local',{method:'POST',body:JSON.stringify(body)}),ctx);
    expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  });
  it('returns safe conflict code and the locked latest parent',async()=>{
    setup({data:null,error:{code:'P0001',message:'WORKFLOW_REVISION_CONFLICT',details:JSON.stringify({project_id:project,revision:13}),hint:'private'},status:400});
    const response=await post(new Request('http://local',{method:'POST',body:JSON.stringify({base_revision:12})}),ctx);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ok:false,error:workflow.replaceAll('-','_').toUpperCase()+'_REVISION_CONFLICT',code:workflow.replaceAll('-','_').toUpperCase()+'_REVISION_CONFLICT',[latestKey]:{project_id:project,revision:13}});
  });
  it('keeps an empty legacy body and supplies its server-observed revision',async()=>{
    const rpc=setup({data:null,error:{code:'P0001',message:'WORKFLOW_VERSION_NOT_FOUND'},status:400});
    const response=await post(new Request('http://local',{method:'POST'}),ctx);
    expect(response.status).toBe(404);
    expect(rpc).toHaveBeenCalledWith('restore_workflow_version',expect.objectContaining({p_expected_revision:12}));
  });
  it.each(['', '{}'])('accepts valid legacy input %j',async body=>{
    const rpc=setup({data:null,error:{code:'P0001',message:'WORKFLOW_VERSION_NOT_FOUND'},status:400});
    const response=await post(new Request('http://local',{method:'POST',body}),ctx);
    expect(response.status).toBe(404);
    expect(rpc).toHaveBeenCalledWith('restore_workflow_version',expect.objectContaining({p_expected_revision:12}));
  });
  it.each(['{"base_revision":0,','not json',' '])('rejects malformed nonempty JSON %j without mutation',async body=>{
    const rpc=setup({data:null,error:{code:'P0001',message:'WORKFLOW_VERSION_NOT_FOUND'},status:400});
    const response=await post(new Request('http://local',{method:'POST',body}),ctx);
    expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects an unreadable body without mutation',async()=>{
    const rpc=setup({data:null,error:{code:'P0001',message:'WORKFLOW_VERSION_NOT_FOUND'},status:400});
    const request=new Request('http://local',{method:'POST',body:'{}'});
    await request.text();
    const response=await post(request,ctx);
    expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0,11])('preserves explicit stale revision %i through the RPC boundary',async base_revision=>{
    const rpc=setup({data:null,error:{code:'P0001',message:'WORKFLOW_REVISION_CONFLICT',details:JSON.stringify({revision:12})},status:400});
    const response=await post(new Request('http://local',{method:'POST',body:JSON.stringify({base_revision})}),ctx);
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith('restore_workflow_version',expect.objectContaining({p_expected_revision:base_revision}));
  });
});
