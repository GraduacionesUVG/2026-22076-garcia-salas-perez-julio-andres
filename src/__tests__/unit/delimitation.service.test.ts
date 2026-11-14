import { DelimitationService } from '@/src/modules/delimitation/delimitation.service';

const project = 'delim-project', actor = 'delim-actor';
function setup(overrides: Record<string, jest.Mock> = {}) {
  const repo = {getDelimitation:jest.fn().mockResolvedValue(null),getItems:jest.fn().mockResolvedValue([]),getLatestVersion:jest.fn().mockResolvedValue(null),saveDelimitationWithRevision:jest.fn(),createItem:jest.fn(),updateItem:jest.fn(),deleteItemReturning:jest.fn(),getNextVersionNumber:jest.fn().mockResolvedValue(4),createVersion:jest.fn(),getVersionById:jest.fn(),getVersionItems:jest.fn(),...overrides};
  return {repo,service:new DelimitationService(repo as never)};
}
describe('DelimitationService persistence contracts',()=>{
  it('normalizes a missing draft and separates include/exclude without dropping identity',async()=>{
    const items=[{id:'in',kind:'include',text:'A'},{id:'out',kind:'exclude',text:'B'}];
    const {service}=setup({getItems:jest.fn().mockResolvedValue(items)});
    expect(await service.getFull(project)).toEqual({delim:{project_id:project,topic:'',context_place:'',population:'',time_period:'',resources:'',revision:0,created_at:new Date(0).toISOString(),updated_at:new Date(0).toISOString(),created_by:null,updated_by:null},include:[items[0]],exclude:[items[1]]});
  });
  it('does not write an unchanged save',async()=>{
    const {repo,service}=setup();
    expect((await service.update(project,{base_revision:0})).revision).toBe(0);
    expect(repo.saveDelimitationWithRevision).not.toHaveBeenCalled();expect(repo.getLatestVersion).not.toHaveBeenCalled();
  });
  it('passes explicit revision zero and actor, returning the saved row',async()=>{
    const saved={project_id:project,topic:'Saved',revision:1};
    const {repo,service}=setup({saveDelimitationWithRevision:jest.fn().mockResolvedValue(saved)});
    expect(await service.update(project,{base_revision:0,topic:'Saved'},{actorUserId:actor})).toEqual(saved);
    expect(repo.saveDelimitationWithRevision).toHaveBeenCalledWith(project,{topic:'Saved'},0,actor);
  });
  it('stops before checkpoint on failed primary save',async()=>{
    const error=Object.assign(new Error('conflict'),{status:409});
    const {repo,service}=setup({saveDelimitationWithRevision:jest.fn().mockRejectedValue(error)});
    await expect(service.update(project,{base_revision:2,topic:'X'})).rejects.toBe(error);
    expect(repo.getLatestVersion).not.toHaveBeenCalled();
  });
  it.each([null,{id:'child',text:'Updated'}])('checkpoints only an existing updated item %j',async result=>{
    const {repo,service}=setup({updateItem:jest.fn().mockResolvedValue(result)});
    expect(await service.updateItem(project,'child',{text:'Updated'},{actorUserId:actor})).toEqual(result);
    expect(repo.updateItem).toHaveBeenCalledWith(project,'child',{text:'Updated'});
    expect(repo.getLatestVersion).toHaveBeenCalledTimes(result?1:0);
  });
  it.each([{rows:[]},{rows:[{id:'deleted'}]}])('reports the exact delete count %j',async ({rows})=>{
    const {repo,service}=setup({deleteItemReturning:jest.fn().mockResolvedValue(rows)});
    expect(await service.removeItemWithCount(project,'deleted')).toEqual({deletedCount:rows.length});
    expect(repo.getLatestVersion).toHaveBeenCalledTimes(rows.length?1:0);
  });
  it.each([true,false])('saves numbered snapshots and preserves duplicate result %s',async created=>{
    const version={id:'snapshot',version_number:4};
    const {repo,service}=setup({getItems:jest.fn().mockResolvedValue([{kind:'include',text:'  A  '},{kind:'exclude',text:'B'}]),createVersion:jest.fn().mockResolvedValue({created,version})});
    expect(await service.saveVersion(project,actor,'label')).toEqual({created,reason:created?null:'duplicate_snapshot',version});
    expect(repo.createVersion).toHaveBeenCalledWith({projectId:project,versionNumber:4,label:'label',createdBy:actor,triggerType:'manual',contentHash:expect.stringMatching(/^[a-f0-9]{64}$/),items:[{kind:'include',text:'  A  ',position:0},{kind:'exclude',text:'B',position:1}],snapshot:{topic:'',context_place:'',population:'',time_period:'',resources:''}});
  });
  it('rejects missing snapshots before reading children',async()=>{
    const {repo,service}=setup({getVersionById:jest.fn().mockResolvedValue(null)});
    await expect(service.getVersion(project,'absent')).rejects.toMatchObject({status:404,message:'VERSION_NOT_FOUND'});expect(repo.getVersionItems).not.toHaveBeenCalled();
  });
});
