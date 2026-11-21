import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { createHash } from 'crypto';

describe('ResearchDesignService actual snapshot creation',()=>{
  const project='snapshot-research-project',actor='snapshot-research-actor';
  const design={project_id:project,research_question:'  Question  ',general_objective:' Objective ',revision:4};
  const objectives=[{id:'later',text:' Later ',position:7},{id:'first',text:' First ',position:2}];
  const version={id:'research-snapshot',project_id:project,version_number:9,label:'Label',snapshot_research_question:'Question',snapshot_general_objective:'Objective',trigger_type:'manual',content_hash:null,created_at:'2026-10-04T00:00:00Z',created_by:actor};
  const items=[{id:'later-snapshot',text:'Later',position:7,version_id:version.id},{id:'first-snapshot',text:'First',position:2,version_id:version.id}];
  const canonical={research_question:'Question',general_objective:'Objective',specific_objectives:[{text:'First',position:2},{text:'Later',position:7}]};
  const hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  function setup(){const repo={getResearchDesign:jest.fn().mockResolvedValue(design),getSpecificObjectives:jest.fn().mockResolvedValue(objectives),createVersionSnapshot:jest.fn().mockResolvedValue({created:true,version}),getVersionItems:jest.fn().mockResolvedValue(items)};return {repo,service:new ResearchDesignService(repo as never)};}
  it.each([true,false])('normalizes and persists exact content/actor, rereading created or duplicate children (%s)',async created=>{
    const {repo,service}=setup();repo.createVersionSnapshot.mockResolvedValue({created,version});const result=await service.createVersion(project,{label:' Label '},{actorUserId:actor});
    expect(repo.createVersionSnapshot).toHaveBeenCalledWith(project,{label:'Label',trigger_type:'manual',snapshot_research_question:'Question',snapshot_general_objective:'Objective',specific_objectives:[{text:'Later',position:7},{text:'First',position:2}],content_hash:hash},actor);
    expect(repo.getVersionItems).toHaveBeenCalledWith(version.id);expect(result).toEqual({created,reason:created?null:'duplicate_snapshot',version:{id:version.id,project_id:project,version_number:9,label:'Label',created_by:actor,created_at:version.created_at,trigger_type:'manual',content_hash:null,snapshot:{research_question:'Question',general_objective:'Objective',specific_objectives:[{id:'first-snapshot',text:'First',position:2},{id:'later-snapshot',text:'Later',position:7}]}}});
  });
  it('rejects an empty draft before persisting or reading version children',async()=>{const {repo,service}=setup();repo.getResearchDesign.mockResolvedValue({project_id:project,research_question:' ',general_objective:'',revision:0});repo.getSpecificObjectives.mockResolvedValue([]);await expect(service.createVersion(project,{})).rejects.toMatchObject({status:400,message:'RESEARCH_DESIGN_NOTHING_TO_SNAPSHOT'});expect(repo.createVersionSnapshot).not.toHaveBeenCalled();expect(repo.getVersionItems).not.toHaveBeenCalled();});
  it('uses normalized empty label and explicit checkpoint trigger with null actor',async()=>{const {repo,service}=setup();await service.createVersion(project,{label:' ',trigger_type:'auto_checkpoint'});expect(repo.createVersionSnapshot).toHaveBeenCalledWith(project,expect.objectContaining({label:null,trigger_type:'auto_checkpoint',content_hash:hash}),null);});
  it('stops before child reread when snapshot persistence is rejected',async()=>{const {repo,service}=setup();const error=Object.assign(new Error('snapshot conflict'),{status:409});repo.createVersionSnapshot.mockRejectedValue(error);await expect(service.createVersion(project,{})).rejects.toBe(error);expect(repo.createVersionSnapshot).toHaveBeenCalledTimes(1);expect(repo.getVersionItems).not.toHaveBeenCalled();});
  it('propagates child reread failure without redoing persistence',async()=>{const {repo,service}=setup();const error=Object.assign(new Error('child conflict'),{status:409});repo.getVersionItems.mockRejectedValue(error);await expect(service.createVersion(project,{})).rejects.toBe(error);expect(repo.createVersionSnapshot).toHaveBeenCalledTimes(1);expect(repo.getVersionItems).toHaveBeenCalledTimes(1);});
});

describe('ResearchDesignService draft and objective contracts',()=>{
  it.each([null,{project_id:'research-project',revision:6,research_question:'Existing'}])('returns unchanged draft %j without writing',async row=>{
    const repo={getResearchDesign:jest.fn().mockResolvedValue(row),saveResearchDesignWithRevision:jest.fn()};
    const result=await new ResearchDesignService(repo as never).update('research-project',{base_revision:0});
    expect(result).toEqual(row??{project_id:'research-project',research_question:'',general_objective:'',revision:0,created_at:new Date(0).toISOString(),updated_at:new Date(0).toISOString(),created_by:null,updated_by:null});expect(repo.saveResearchDesignWithRevision).not.toHaveBeenCalled();
  });
  it('propagates displayed revision zero and distinct actor to save',async()=>{
    const saved={revision:1,research_question:'Question'};const repo={saveResearchDesignWithRevision:jest.fn().mockResolvedValue(saved)};
    expect(await new ResearchDesignService(repo as never).update('research-project',{base_revision:0,research_question:'Question'},{actorUserId:'research-actor'})).toEqual(saved);
    expect(repo.saveResearchDesignWithRevision).toHaveBeenCalledWith('research-project',{research_question:'Question'},0,'research-actor');
  });
  it.each([{ids:[]},{ids:['a']},{ids:['a','a']},{ids:['a','unknown']}])('rejects incomplete or duplicate reorder %j before writes',async ({ids})=>{
    const repo={getSpecificObjectives:jest.fn().mockResolvedValue([{id:'a',position:0},{id:'b',position:1}]),updateSpecificObjectivePosition:jest.fn()};
    await expect(new ResearchDesignService(repo as never).reorderSpecificObjectives('research-project',ids)).rejects.toMatchObject({status:400,message:'INVALID_OBJECTIVE_ORDER'});expect(repo.updateSpecificObjectivePosition).not.toHaveBeenCalled();
  });
  it('reorders only changed positions and returns the reread rows',async()=>{
    const rows=[{id:'a',position:0},{id:'b',position:1}],final=[{id:'b',position:0},{id:'a',position:1}];
    const repo={getSpecificObjectives:jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce(final),updateSpecificObjectivePosition:jest.fn().mockResolvedValue(null)};
    expect(await new ResearchDesignService(repo as never).reorderSpecificObjectives('research-project',['b','a'],{actorUserId:'research-actor'})).toEqual(final);
    expect(repo.updateSpecificObjectivePosition.mock.calls).toEqual([['research-project','b',0,'research-actor'],['research-project','a',1,'research-actor']]);
  });
  it('stops a reorder after the first rejected write without rereading',async()=>{
    const error=Object.assign(new Error('conflict'),{status:409});const repo={getSpecificObjectives:jest.fn().mockResolvedValue([{id:'a',position:0},{id:'b',position:1}]),updateSpecificObjectivePosition:jest.fn().mockRejectedValue(error)};
    await expect(new ResearchDesignService(repo as never).reorderSpecificObjectives('research-project',['b','a'])).rejects.toBe(error);expect(repo.getSpecificObjectives).toHaveBeenCalledTimes(1);expect(repo.updateSpecificObjectivePosition).toHaveBeenCalledTimes(1);
  });
  it('rejects an empty objective collection',async()=>{const repo={getSpecificObjectives:jest.fn().mockResolvedValue([])};await expect(new ResearchDesignService(repo as never).reorderSpecificObjectives('research-project',[])).rejects.toMatchObject({message:'NO_SPECIFIC_OBJECTIVES',status:400});});
  it('rejects a missing version without reading its children',async()=>{const repo={getVersionById:jest.fn().mockResolvedValue(null),getVersionItems:jest.fn()};await expect(new ResearchDesignService(repo as never).getVersion('research-project','missing')).rejects.toMatchObject({status:404,message:'RESEARCH_DESIGN_VERSION_NOT_FOUND'});expect(repo.getVersionItems).not.toHaveBeenCalled();});
});
import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";

describe("ResearchDesignService.listVersions", () => {
  it("loads version items in one batch instead of one query per version", async () => {
    const repo: Record<string, jest.Mock> = {
      listVersions: jest.fn().mockResolvedValue([
        {
          id: "version-2",
          project_id: "project-1",
          version_number: 2,
          label: null,
          snapshot_research_question: "Pregunta 2",
          snapshot_general_objective: "Objetivo 2",
          created_by: null,
          created_at: "2026-01-02T00:00:00.000Z",
          trigger_type: "manual",
          content_hash: null,
        },
        {
          id: "version-1",
          project_id: "project-1",
          version_number: 1,
          label: null,
          snapshot_research_question: "Pregunta 1",
          snapshot_general_objective: "Objetivo 1",
          created_by: null,
          created_at: "2026-01-01T00:00:00.000Z",
          trigger_type: "manual",
          content_hash: null,
        },
      ]),
      getVersionItemsForVersions: jest.fn().mockResolvedValue([
        {
          id: "item-2",
          version_id: "version-2",
          text: "Objetivo especifico 2",
          position: 0,
          created_at: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "item-1",
          version_id: "version-1",
          text: "Objetivo especifico 1",
          position: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ]),
      getVersionItems: jest.fn(),
    };

    const service = new ResearchDesignService(repo as never);

    const versions = await service.listVersions("project-1");

    expect(repo.getVersionItemsForVersions).toHaveBeenCalledWith([
      "version-2",
      "version-1",
    ]);
    expect(repo.getVersionItems).not.toHaveBeenCalled();
    expect(versions).toHaveLength(2);
    expect(versions[0].snapshot.specific_objectives[0].text).toBe(
      "Objetivo especifico 2"
    );
  });

  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before loading version items",
    async (failureCase) => {
      const repo: Record<string, jest.Mock> = {
        listVersions: jest
          .fn()
          .mockRejectedValue(freshProviderFailure(failureCase)),
        getVersionItemsForVersions: jest.fn(),
      };
      const service = new ResearchDesignService(repo as never);

      const observed = await captureRejection(service.listVersions("project-1"));

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.getVersionItemsForVersions).not.toHaveBeenCalled();
    }
  );
});

describe("ResearchDesignService mutation dependency failures", () => {
  it("RED: stops reordering safely after the current-objective read fails", async () => {
    const providerError = freshProviderFailure(SUPABASE_FAILURE_CASES[0]);
    const repo: Record<string, jest.Mock> = {
      getSpecificObjectives: jest.fn().mockRejectedValue(providerError),
      updateSpecificObjectivePosition: jest.fn(),
    };
    const service = new ResearchDesignService(repo as never);

    const observed = await captureRejection(
      service.reorderSpecificObjectives("project-1", ["objective-1"], {
        actorUserId: "user-1",
      })
    );

    expectSafeDependencyFailure(observed, SUPABASE_FAILURE_CASES[0]);
    expect(repo.updateSpecificObjectivePosition).not.toHaveBeenCalled();
    expect(repo.getSpecificObjectives).toHaveBeenCalledTimes(1);
  });
});
