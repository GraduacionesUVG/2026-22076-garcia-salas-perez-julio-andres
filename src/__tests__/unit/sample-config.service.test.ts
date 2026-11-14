import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";
import { createHash } from 'crypto';

describe('SampleConfigService actual snapshot creation',()=>{
  const project='snapshot-sample-project',actor='snapshot-sample-actor';
  const config={project_id:project,revision:3,main_approach_code:'ethnographic',scope_code:null,field_phase:' Field ',target_sample_size:0,sample_size_rationale:' Rationale '};
  const techniques=[{id:'custom',technique_code:null,custom_label:' Custom ',is_custom:true,position:7},{id:'standard',technique_code:'interview',custom_label:null,is_custom:false,position:2}];
  const version={id:'sample-snapshot',project_id:project,version_number:8,label:null,snapshot_main_approach_code:'ethnographic',snapshot_scope_code:null,snapshot_field_phase:' Field ',snapshot_target_sample_size:0,snapshot_sample_size_rationale:' Rationale ',trigger_type:'manual',content_hash:null,created_at:'2026-10-04T00:00:00Z',created_by:actor};
  const children=[{id:'custom-copy',version_id:version.id,technique_code:null,custom_label:' Custom ',is_custom:true,position:7},{id:'standard-copy',version_id:version.id,technique_code:'interview',custom_label:null,is_custom:false,position:2}];
  const hash=createHash('sha256').update(JSON.stringify({main_approach_code:'ethnographic',scope_code:null,field_phase:'Field',target_sample_size:0,sample_size_rationale:'Rationale',collection_techniques:[{technique_code:'interview',custom_label:null,is_custom:false,position:2},{technique_code:null,custom_label:'Custom',is_custom:true,position:7}]})).digest('hex');
  function setup(){const repo={getSampleConfig:jest.fn().mockResolvedValue(config),getCollectionTechniques:jest.fn().mockResolvedValue(techniques),getSampleParticipants:jest.fn().mockResolvedValue([]),createVersionSnapshot:jest.fn().mockResolvedValue({created:true,version}),getVersionTechniques:jest.fn().mockResolvedValue(children)};return {repo,service:new SampleConfigService(repo as never)};}
  it.each([true,false])('hashes normalized sorted content but preserves raw snapshot values and rereads children (%s)',async created=>{const {repo,service}=setup();repo.createVersionSnapshot.mockResolvedValue({created,version});const result=await service.createVersion(project,{label:' '},{actorUserId:actor});expect(repo.createVersionSnapshot).toHaveBeenCalledWith(project,{label:null,trigger_type:'manual',content_hash:hash,snapshot_main_approach_code:'ethnographic',snapshot_scope_code:null,snapshot_field_phase:' Field ',snapshot_target_sample_size:0,snapshot_sample_size_rationale:' Rationale ',collection_techniques:techniques.map(({technique_code,custom_label,is_custom,position})=>({technique_code,custom_label,is_custom,position}))},actor);expect(repo.getVersionTechniques).toHaveBeenCalledWith(version.id);expect(result).toEqual({created,reason:created?null:'duplicate_snapshot',version:{id:version.id,project_id:project,version_number:8,label:null,created_by:actor,created_at:version.created_at,trigger_type:'manual',content_hash:null,snapshot:{main_approach_code:'ethnographic',scope_code:null,field_phase:' Field ',target_sample_size:0,sample_size_rationale:' Rationale ',collection_techniques:[{id:'standard-copy',technique_code:'interview',custom_label:null,is_custom:false,position:2},{id:'custom-copy',technique_code:null,custom_label:' Custom ',is_custom:true,position:7}]}}});});
  it('rejects an empty draft before snapshot persistence',async()=>{const {repo,service}=setup();repo.getSampleConfig.mockResolvedValue(null);repo.getCollectionTechniques.mockResolvedValue([]);await expect(service.createVersion(project,{})).rejects.toMatchObject({status:400,message:'SAMPLE_CONFIG_NOTHING_TO_SNAPSHOT'});expect(repo.createVersionSnapshot).not.toHaveBeenCalled();expect(repo.getVersionTechniques).not.toHaveBeenCalled();});
  it('uses explicit trigger and normalized label with default null actor',async()=>{const {repo,service}=setup();await service.createVersion(project,{label:' Named ',trigger_type:'auto_checkpoint'});expect(repo.createVersionSnapshot).toHaveBeenCalledWith(project,expect.objectContaining({label:'Named',trigger_type:'auto_checkpoint',content_hash:hash}),null);});
  it('stops before children when snapshot persistence fails',async()=>{const {repo,service}=setup();const error=Object.assign(new Error('snapshot conflict'),{status:409});repo.createVersionSnapshot.mockRejectedValue(error);await expect(service.createVersion(project,{})).rejects.toBe(error);expect(repo.createVersionSnapshot).toHaveBeenCalledTimes(1);expect(repo.getVersionTechniques).not.toHaveBeenCalled();});
  it('does not redo snapshot persistence when children fail to reread',async()=>{const {repo,service}=setup();const error=Object.assign(new Error('child conflict'),{status:409});repo.getVersionTechniques.mockRejectedValue(error);await expect(service.createVersion(project,{})).rejects.toBe(error);expect(repo.createVersionSnapshot).toHaveBeenCalledTimes(1);expect(repo.getVersionTechniques).toHaveBeenCalledTimes(1);});
});

describe('SampleConfigService persistence and aggregates',()=>{
  it('preserves revision zero, clears techniques, and reads the resulting state',async()=>{
    const config={project_id:'sample-project',revision:1,field_phase:'Field'};
    const repo={saveSampleConfigWithRevision:jest.fn().mockResolvedValue(config),replaceCollectionTechniques:jest.fn(),getSampleConfig:jest.fn().mockResolvedValue(config),getCollectionTechniques:jest.fn().mockResolvedValue([]),getSampleParticipants:jest.fn().mockResolvedValue([])};
    expect(await new SampleConfigService(repo as never).update('sample-project',{base_revision:0,field_phase:'Field',collection_techniques:[]},{actorUserId:'sample-actor'})).toEqual({config:{...config,actual_sample_size:0},collection_techniques:[],participant_groups:[]});
    expect(repo.saveSampleConfigWithRevision).toHaveBeenCalledWith('sample-project',{field_phase:'Field'},0,'sample-actor');expect(repo.replaceCollectionTechniques).toHaveBeenCalledWith('sample-project',[],'sample-actor');
  });
  it('counts active participants and selects the documented group-label precedence',async()=>{
    const participants=[{status:'active',attributes:{sample_group:' A ',community:'ignored'},alias:'alias'},{status:'active',attributes:{participant_type:'A'},alias:'alias'},{status:'active',attributes:null,display_name:' Name ',alias:'alias'},{status:'active',attributes:{community:'Community'},alias:'alias'},{status:'withdrawn',attributes:{sample_group:'A'},alias:'alias'},{status:'archived',attributes:{sample_group:'A'},alias:'alias'}];
    const repo={getSampleConfig:jest.fn().mockResolvedValue(null),getCollectionTechniques:jest.fn().mockResolvedValue([]),getSampleParticipants:jest.fn().mockResolvedValue(participants)};
    const result=await new SampleConfigService(repo as never).getFull('sample-project');
    expect(result.config).toMatchObject({project_id:'sample-project',revision:0,actual_sample_size:4});expect(result.participant_groups).toEqual([{label:'A',count:2},{label:'Community',count:1},{label:'Name',count:1}]);
  });
  it('stops before reading current state when technique replacement fails',async()=>{
    const error=Object.assign(new Error('conflict'),{status:409});const repo={saveSampleConfigWithRevision:jest.fn(),replaceCollectionTechniques:jest.fn().mockRejectedValue(error),getSampleConfig:jest.fn()};
    await expect(new SampleConfigService(repo as never).update('sample-project',{base_revision:0,collection_techniques:[]})).rejects.toBe(error);expect(repo.getSampleConfig).not.toHaveBeenCalled();
  });
  it('rejects missing versions before child reads',async()=>{const repo={getVersionById:jest.fn().mockResolvedValue(null),getVersionTechniques:jest.fn()};await expect(new SampleConfigService(repo as never).getVersion('sample-project','missing')).rejects.toMatchObject({status:404,message:'SAMPLE_CONFIG_VERSION_NOT_FOUND'});expect(repo.getVersionTechniques).not.toHaveBeenCalled();});
});
import {
  SUPABASE_FAILURE_CASES,
  captureRejection,
  expectSafeDependencyFailure,
  freshProviderFailure,
} from "@/__tests__/backend/supabase-failure-cases";

describe("SampleConfigService.listVersions", () => {
  it("loads version techniques in one batch instead of one query per version", async () => {
    const repo: Record<string, jest.Mock> = {
      listVersions: jest.fn().mockResolvedValue([
        {
          id: "version-2",
          project_id: "project-1",
          version_number: 2,
          label: null,
          snapshot_main_approach_code: "ethnographic",
          snapshot_scope_code: "exploratory",
          snapshot_field_phase: "Trabajo de campo",
          snapshot_target_sample_size: 12,
          snapshot_sample_size_rationale: "Por saturacion teorica.",
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
          snapshot_main_approach_code: "ethnographic",
          snapshot_scope_code: "exploratory",
          snapshot_field_phase: "Trabajo de campo",
          snapshot_target_sample_size: 10,
          snapshot_sample_size_rationale: "Por acceso.",
          created_by: null,
          created_at: "2026-01-01T00:00:00.000Z",
          trigger_type: "manual",
          content_hash: null,
        },
      ]),
      getVersionTechniquesForVersions: jest.fn().mockResolvedValue([
        {
          id: "tech-2",
          version_id: "version-2",
          technique_code: "interview",
          custom_label: null,
          is_custom: false,
          position: 0,
          created_at: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "tech-1",
          version_id: "version-1",
          technique_code: "observation",
          custom_label: null,
          is_custom: false,
          position: 0,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ]),
      getVersionTechniques: jest.fn(),
    };

    const service = new SampleConfigService(repo as never);

    const versions = await service.listVersions("project-1");

    expect(repo.getVersionTechniquesForVersions).toHaveBeenCalledWith([
      "version-2",
      "version-1",
    ]);
    expect(repo.getVersionTechniques).not.toHaveBeenCalled();
    expect(versions).toHaveLength(2);
    expect(versions[0].snapshot.collection_techniques[0].technique_code).toBe(
      "interview"
    );
  });

  it.each(SUPABASE_FAILURE_CASES)(
    "RED: translates $name before loading version techniques",
    async (failureCase) => {
      const repo: Record<string, jest.Mock> = {
        listVersions: jest
          .fn()
          .mockRejectedValue(freshProviderFailure(failureCase)),
        getVersionTechniquesForVersions: jest.fn(),
      };
      const service = new SampleConfigService(repo as never);

      const observed = await captureRejection(service.listVersions("project-1"));

      expectSafeDependencyFailure(observed, failureCase);
      expect(repo.getVersionTechniquesForVersions).not.toHaveBeenCalled();
    }
  );
});

describe("SampleConfigService mutation dependency failures", () => {
  it("RED: stops safely after the primary save fails without replacing techniques or rereading", async () => {
    const providerError = freshProviderFailure(SUPABASE_FAILURE_CASES[0]);
    const repo: Record<string, jest.Mock> = {
      saveSampleConfigWithRevision: jest.fn().mockRejectedValue(providerError),
      replaceCollectionTechniques: jest.fn(),
      getSampleConfig: jest.fn(),
      getCollectionTechniques: jest.fn(),
      getSampleParticipants: jest.fn(),
    };
    const service = new SampleConfigService(repo as never);

    const observed = await captureRejection(
      service.update(
        "project-1",
        {
          base_revision: 0,
          field_phase: "Trabajo de campo",
          collection_techniques: [],
        },
        { actorUserId: "user-1" }
      )
    );

    expectSafeDependencyFailure(observed, SUPABASE_FAILURE_CASES[0]);
    expect(repo.replaceCollectionTechniques).not.toHaveBeenCalled();
    expect(repo.getSampleConfig).not.toHaveBeenCalled();
    expect(repo.getCollectionTechniques).not.toHaveBeenCalled();
    expect(repo.getSampleParticipants).not.toHaveBeenCalled();
  });
});
