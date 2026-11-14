import * as workflowRoute0 from '@/app/api/projects/[id]/delimitation/items/[itemId]/route';
import * as workflowRoute1 from '@/app/api/projects/[id]/research-design/specific-objectives/route';
import * as workflowRoute2 from '@/app/api/projects/[id]/research-design/specific-objectives/[objectiveId]/route';
import * as workflowRoute3 from '@/app/api/projects/[id]/research-design/specific-objectives/reorder/route';
import * as workflowRoute4 from '@/app/api/projects/[id]/delimitation/versions/route';
import * as workflowRoute5 from '@/app/api/projects/[id]/delimitation/versions/[versionId]/route';
import * as workflowRoute6 from '@/app/api/projects/[id]/research-design/versions/route';
import * as workflowRoute7 from '@/app/api/projects/[id]/research-design/versions/[versionId]/route';
import * as workflowRoute8 from '@/app/api/projects/[id]/sample-config/versions/route';
import * as workflowRoute9 from '@/app/api/projects/[id]/sample-config/versions/[versionId]/route';
import * as workflowRoute10 from '@/app/api/projects/[id]/sample-config/route';
import { GET as delimGet, PATCH as delimPatch, PUT as delimPut } from '@/app/api/projects/[id]/delimitation/route';
import { GET as researchGet, PATCH as researchPatch, PUT as researchPut } from '@/app/api/projects/[id]/research-design/route';
import { POST as addItem } from '@/app/api/projects/[id]/delimitation/items/route';
import { GET as optionsGet } from '@/app/api/projects/[id]/sample-config/options/route';
import { requireProjectRole } from '@/src/modules/projects/project.guard';
import { createRecordedSupabase } from '@/__tests__/backend/recorded-supabase';
import { DelimitationService } from '@/src/modules/delimitation/delimitation.service';
import { ResearchDesignService } from '@/src/modules/research-design/research-design.service';
import { SampleConfigService } from '@/src/modules/sample-config/sample-config.service';
jest.mock('@/src/modules/projects/project.guard',()=>({requireProjectRole:jest.fn()}));
const project='00000000-0000-4000-8000-000000000071',actor='00000000-0000-4000-8000-000000000072';
const ctx={params:Promise.resolve({id:project})};
type WorkflowHandler = (request: Request, context: {params: Promise<{id:string;itemId?:string;objectiveId?:string;versionId?:string}>}) => Promise<Response>;
const workflowRoutes: Record<string, Record<string, WorkflowHandler>> = {
 'delimitation/items/[itemId]': workflowRoute0 as unknown as Record<string, WorkflowHandler>,
 'research-design/specific-objectives': workflowRoute1 as unknown as Record<string, WorkflowHandler>,
 'research-design/specific-objectives/[objectiveId]': workflowRoute2 as unknown as Record<string, WorkflowHandler>,
 'research-design/specific-objectives/reorder': workflowRoute3 as unknown as Record<string, WorkflowHandler>,
 'delimitation/versions': workflowRoute4 as unknown as Record<string, WorkflowHandler>,
 'delimitation/versions/[versionId]': workflowRoute5 as unknown as Record<string, WorkflowHandler>,
 'research-design/versions': workflowRoute6 as unknown as Record<string, WorkflowHandler>,
 'research-design/versions/[versionId]': workflowRoute7 as unknown as Record<string, WorkflowHandler>,
 'sample-config/versions': workflowRoute8 as unknown as Record<string, WorkflowHandler>,
 'sample-config/versions/[versionId]': workflowRoute9 as unknown as Record<string, WorkflowHandler>,
 'sample-config': workflowRoute10 as unknown as Record<string, WorkflowHandler>,
};
function setup(responses: Parameters<typeof createRecordedSupabase>[0]){const db=createRecordedSupabase(responses);jest.mocked(requireProjectRole).mockResolvedValue({supabase:db.client,user:{id:actor}} as never);return db;}
beforeEach(()=>jest.clearAllMocks());
afterEach(()=>jest.restoreAllMocks());
describe.each([['delimitation',delimPatch,delimPut,'topic','delim'],['research-design',researchPatch,researchPut,'research_question','design']] as const)('%s exported save handlers', (workflow,patch,put,field,key)=>{
  it.each([['PATCH',patch],['PUT',put]] as const)('%s saves parsed input with revision zero and authenticated actor',async(method,handler)=>{
    const row={project_id:project,revision:1,[field]:'Saved'};const db=setup([{status:200,body:null},{status:201,body:row},...(workflow==='delimitation'?[{status:200,body:null}]:[])]);
    const response=await handler(new Request('http://local',{method,body:JSON.stringify({base_revision:0,[field]:' Saved '})}),ctx);
    expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,[key]:row});expect(requireProjectRole).toHaveBeenCalledWith(project,['owner','editor']);expect(db.requests[1].body).toMatchObject({project_id:project,revision:1,[field]:'Saved',created_by:actor,updated_by:actor});db.assertDrained();
  });
  it('rejects invalid revision before any database effect',async()=>{const db=setup([]);const response=await patch(new Request('http://local',{method:'PATCH',body:JSON.stringify({base_revision:-1,[field]:'X'})}),ctx);expect(response.status).toBe(400);expect(await response.json()).toMatchObject({ok:false,error:'Validation error'});db.assertDrained();expect(db.requests).toEqual([]);});
  it('returns exact stale-revision envelope without a write',async()=>{const latest={project_id:project,revision:9};const db=setup([{status:200,body:latest}]);const response=await patch(new Request('http://local',{method:'PATCH',body:JSON.stringify({base_revision:0,[field]:'X'})}),ctx);const code=workflow.replaceAll('-','_').toUpperCase()+'_REVISION_CONFLICT';expect(response.status).toBe(409);expect(await response.json()).toEqual({ok:false,error:code,code,[workflow==='delimitation'?'latest_delimitation':'latest_design']:latest});expect(db.requests).toHaveLength(1);db.assertDrained();});
  it('PUT rejects a stale revision through the actual repository without downstream mutation',async()=>{
    const latest={project_id:project,revision:9,[field]:'Current'};
    const db=setup([{status:200,body:latest}]);
    try {
      const response=await put(new Request('http://local',{method:'PUT',body:JSON.stringify({base_revision:0,[field]:' Rejected '})}),ctx);
      const code=workflow.replaceAll('-','_').toUpperCase()+'_REVISION_CONFLICT';
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ok:false,error:code,code,[workflow==='delimitation'?'latest_delimitation':'latest_design']:latest});
      expect(jest.mocked(requireProjectRole).mock.calls).toEqual([[project,['owner','editor']]]);
      expect(db.requests).toHaveLength(1);
      expect(db.requests[0].method).toBe('GET');
      expect(db.requests[0].url.pathname).toBe(workflow==='delimitation'?'/rest/v1/project_delimitation':'/rest/v1/project_research_design');
      expect(db.requests[0].url.searchParams.get('project_id')).toBe('eq.'+project);
      expect(db.requests[0].body).toBeNull();
    } finally { db.assertDrained(); }
  });
});
it.each([['delimitation',delimGet],['research',researchGet]] as const)('%s GET normalizes absent parent and keeps empty child/evaluation contracts',async(workflow,handler)=>{const db=setup([{status:200,body:null},{status:200,body:[]}]);const response=await handler(new Request('http://local'),ctx);expect(response.status).toBe(200);const body=await response.json();expect(body.ok).toBe(true);expect(body.data[workflow==='research'?'design':'delim']).toMatchObject({project_id:project,revision:0});if(workflow==='research')expect(body.data).toMatchObject({specific_objectives:[],evaluation:null});else expect(body.data).toMatchObject({include:[],exclude:[]});expect(requireProjectRole).toHaveBeenCalledWith(project,['owner','editor','viewer']);db.assertDrained();});
it('creates a trimmed delimitation item through actual repository',async()=>{const item={id:'new-child',kind:'include',text:'Item'};const db=setup([{status:201,body:item},{status:200,body:null}]);const response=await addItem(new Request('http://local',{method:'POST',body:JSON.stringify({kind:'include',text:' Item '})}),ctx);expect(response.status).toBe(201);expect(await response.json()).toEqual({ok:true,item});expect(db.requests[0].body).toEqual({project_id:project,kind:'include',text:'Item'});db.assertDrained();});
it('rejects invalid item kinds with no write',async()=>{const db=setup([]);const response=await addItem(new Request('http://local',{method:'POST',body:'{"kind":"other","text":"X"}'}),ctx);expect(response.status).toBe(400);expect(await response.json()).toMatchObject({error:'Validation error',ok:false});db.assertDrained();});
it('returns distinct catalog option collections',async()=>{const rows=[[{code:'ethnographic',label:'Ethnographic'}],[{code:'exploratory',label:'Exploratory'}],[{code:'interview',label:'Interview'}]];const db=setup(rows.map(body=>({status:200,body})));const response=await optionsGet(new Request('http://local'),ctx);expect(await response.json()).toEqual({ok:true,options:{main_approaches:rows[0],scopes:rows[1],collection_technique_options:rows[2]}});expect(response.status).toBe(200);db.assertDrained();});
it.each([delimGet,researchGet,optionsGet])('preserves rejected access and causes no database request',async handler=>{const db=setup([]);jest.mocked(requireProjectRole).mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));const response=await handler(new Request('http://local'),ctx);expect(response.status).toBe(403);expect(await response.json()).toEqual({ok:false,error:'Forbidden'});expect(db.requests).toEqual([]);db.assertDrained();});

const child='00000000-0000-4000-8000-000000000073',versionId='00000000-0000-4000-8000-000000000074';
const childCtx={params:Promise.resolve({id:project,itemId:child,objectiveId:child,versionId})};
const endpointCases=[
  {path:'delimitation/items/[itemId]',verb:'PATCH',Service:DelimitationService,method:'updateItem',body:{text:' Child '},args:[project,child,{text:'Child'},{actorUserId:actor}],result:{id:child,text:'Child',kind:'include'},envelope:'item',status:200},
  {path:'delimitation/items/[itemId]',verb:'DELETE',Service:DelimitationService,method:'removeItemWithCount',args:[project,child,{actorUserId:actor}],result:{deletedCount:1},envelope:null,status:200},
  {path:'research-design/specific-objectives',verb:'POST',Service:ResearchDesignService,method:'addSpecificObjective',body:{text:' Child '},args:[project,{text:'Child'},{actorUserId:actor}],result:{id:child,text:'Child',position:0},envelope:'objective',status:201},
  {path:'research-design/specific-objectives/[objectiveId]',verb:'PATCH',Service:ResearchDesignService,method:'updateSpecificObjective',body:{text:' Child ',base_revision:0},args:[project,child,{text:'Child',base_revision:0},{actorUserId:actor}],result:{id:child,text:'Child',revision:1},envelope:'objective',status:200},
  {path:'research-design/specific-objectives/[objectiveId]',verb:'DELETE',Service:ResearchDesignService,method:'removeSpecificObjectiveWithCount',args:[project,child,{actorUserId:actor}],result:{deletedCount:1},envelope:null,status:200},
  {path:'research-design/specific-objectives/reorder',verb:'POST',Service:ResearchDesignService,method:'reorderSpecificObjectives',body:{ordered_ids:[child]},args:[project,[child],{actorUserId:actor}],result:[{id:child,text:'Child',position:0}],envelope:'objectives',status:200},
  ...([ ['delimitation',DelimitationService,'data'],['research-design',ResearchDesignService,'snapshot'],['sample-config',SampleConfigService,'snapshot'] ] as const).flatMap(([path,Service,envelope])=>[
    {path:`${path}/versions`,verb:'GET',Service,method:'listVersions',args:[project],result:[{id:versionId,version_number:3}],envelope:'versions',status:200},
    {path:`${path}/versions/[versionId]`,verb:'GET',Service,method:'getVersion',args:[project,versionId],result:{version:{id:versionId,version_number:3},items:[{text:'Snapshot'}]},envelope,status:200},
  ]),
  ...['PATCH','PUT'].map(verb=>({path:'sample-config',verb,Service:SampleConfigService,method:'update',body:{base_revision:0,field_phase:' Field ',collection_techniques:[]},args:[project,{base_revision:0,field_phase:'Field',collection_techniques:[]},{actorUserId:actor}],result:{config:{project_id:project,revision:1,field_phase:'Field'},collection_techniques:[],participant_groups:[]},envelope:'data',status:200})),
];
describe.each(endpointCases)('$verb $path exported boundary',testCase=>{
  const route=workflowRoutes[testCase.path];
  function invoke(){return route[testCase.verb](new Request('http://local',{method:testCase.verb,...('body' in testCase?{body:JSON.stringify(testCase.body)}:{})}),childCtx);}
  it('returns the actual service result and passes exact parsed IDs/body/actor/roles',async()=>{
    const db=setup([]);const spy=jest.spyOn(testCase.Service.prototype as never,testCase.method as never) as jest.SpyInstance;spy.mockResolvedValue(testCase.result);
    const response=await invoke();expect(response.status).toBe(testCase.status);expect(await response.json()).toEqual({ok:true,...(testCase.envelope?{[testCase.envelope as string]:testCase.result}:testCase.result)});
    expect(spy).toHaveBeenCalledWith(...testCase.args);expect(requireProjectRole).toHaveBeenCalledWith(project,testCase.verb==='GET'?['owner','editor','viewer']:['owner','editor']);db.assertDrained();
  });
  it('returns a rejected service error without fabricating success',async()=>{
    const db=setup([]);const spy=jest.spyOn(testCase.Service.prototype as never,testCase.method as never) as jest.SpyInstance;spy.mockRejectedValue(Object.assign(new Error('Missing snapshot or child'),{status:404}));const response=await invoke();expect(response.status).toBe(404);expect(await response.json()).toEqual({ok:false,error:'Missing snapshot or child'});expect(spy).toHaveBeenCalledTimes(1);db.assertDrained();
  });
  if(testCase.method==='updateItem'||testCase.method==='updateSpecificObjective'||testCase.method==='removeItemWithCount'||testCase.method==='removeSpecificObjectiveWithCount')it('returns missing-child contract for null or zero affected rows',async()=>{const db=setup([]);const spy=jest.spyOn(testCase.Service.prototype as never,testCase.method as never) as jest.SpyInstance;spy.mockResolvedValue(testCase.verb==='DELETE'?{deletedCount:0}:null);const response=await invoke();expect(response.status).toBe(404);expect(await response.json()).toEqual({ok:false,error:testCase.path.startsWith('delimitation')?'ITEM_NOT_FOUND':'OBJECTIVE_NOT_FOUND'});db.assertDrained();});
});
describe.each([['delimitation',DelimitationService,'saveVersion'],['research-design',ResearchDesignService,'createVersion'],['sample-config',SampleConfigService,'createVersion']] as const)('%s version creation exported boundary',(workflow,Service,method)=>{
  const post=workflowRoutes[`${workflow}/versions`].POST;
  it.each([true,false])('preserves created versus duplicate snapshot %s',async created=>{const db=setup([]);const version={id:versionId,project_id:project,version_number:4,label:'Checkpoint'};const result={version,created,reason:created?null:'duplicate_snapshot'};const spy=jest.spyOn(Service.prototype as never,method as never) as jest.SpyInstance;spy.mockResolvedValue(result);const response=await post(new Request('http://local',{method:'POST',body:'{"label":" Checkpoint "}'}),ctx);expect(response.status).toBe(created?201:200);expect(await response.json()).toEqual(workflow==='delimitation'?{ok:true,version,created,reason:result.reason,data:result}:{ok:true,version});expect(spy).toHaveBeenCalledWith(...(workflow==='delimitation'?[project,actor,'Checkpoint',{triggerType:'manual'}]:[project,{label:'Checkpoint'},{actorUserId:actor}]));expect(requireProjectRole).toHaveBeenCalledWith(project,['owner','editor']);db.assertDrained();});
  it('rejects a missing snapshot source without success payload',async()=>{const db=setup([]);const spy=jest.spyOn(Service.prototype as never,method as never) as jest.SpyInstance;spy.mockRejectedValue(Object.assign(new Error('Nothing to snapshot'),{status:400}));const response=await post(new Request('http://local',{method:'POST',body:'{}'}),ctx);expect(response.status).toBe(400);expect(await response.json()).toEqual({ok:false,error:'Nothing to snapshot'});db.assertDrained();});
});
it('sample GET returns full current data plus options',async()=>{const db=setup([]);const data={config:{project_id:project,revision:0,actual_sample_size:0},collection_techniques:[],participant_groups:[]};const options={main_approaches:[{code:'a'}],scopes:[],collection_technique_options:[]};jest.spyOn(SampleConfigService.prototype,'getFull').mockResolvedValue(data as never);jest.spyOn(SampleConfigService.prototype,'getOptions').mockResolvedValue(options as never);const response=await workflowRoutes['sample-config'].GET(new Request('http://local'),ctx);expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,data:{...data,options}});expect(SampleConfigService.prototype.getFull).toHaveBeenCalledWith(project);db.assertDrained();});
it('sample GET propagates rejected data read',async()=>{const db=setup([]);jest.spyOn(SampleConfigService.prototype,'getFull').mockRejectedValue(Object.assign(new Error('Unavailable'),{status:503}));jest.spyOn(SampleConfigService.prototype,'getOptions').mockResolvedValue({main_approaches:[],scopes:[],collection_technique_options:[]});const response=await workflowRoutes['sample-config'].GET(new Request('http://local'),ctx);expect(response.status).toBe(503);expect(await response.json()).toEqual({ok:false,error:'DEPENDENCY_UNAVAILABLE'});db.assertDrained();});
