import {
  ProjectExportsOrchestrator,
  getProjectExportTypesForBundleScope,
  PROJECT_EXPORT_BUNDLE_SCOPES,
} from "@/src/modules/exports/project-exports.orchestrator";
import { ProjectsRepo } from '@/src/modules/projects/projects.repo';
import { AnalysisCodesService } from '@/src/modules/analysis/analysis-codes.service';
import { AnalysisOverviewService } from '@/src/modules/analysis/analysis-overview.service';
import { createRecordedSupabase } from '../backend/recorded-supabase';

describe('real export assembly boundaries', () => {
  afterEach(() => jest.restoreAllMocks());
  const id = 'e75f66b9-4704-4c28-b2d3-16932e0f94e0';
  it('rejects absent project before reading evidence using installed SDK', async () => {
    const db = createRecordedSupabase([{ status: 200, body: null }]);
    const orchestrator = new ProjectExportsOrchestrator(db.client as never);
    await expect(orchestrator.buildModel(id, 'codebook')).rejects.toMatchObject({ message: 'PROJECT_NOT_FOUND', status: 404 });
    expect(db.requests).toHaveLength(1); expect(db.requests[0].url.searchParams.get('id')).toBe(`eq.${id}`); db.assertDrained();
  });
  it('normalizes blank project title and requests bounded nondeleted code data', async () => {
    jest.spyOn(ProjectsRepo.prototype, 'getById').mockResolvedValue({ name: '  ' } as never);
    const codes = jest.spyOn(AnalysisCodesService.prototype, 'listByProject').mockResolvedValue([]);
    const stats = jest.spyOn(AnalysisOverviewService.prototype, 'getCodeUsageStats').mockResolvedValue([]);
    const model = await new ProjectExportsOrchestrator({} as never).buildModel(id, 'codebook');
    expect(model.title).toBe('Codebook - Proyecto'); expect(codes).toHaveBeenCalledWith(id, { limit: 200, offset: 0, include_deleted: false }); expect(stats).toHaveBeenCalledWith(id, { limit: 200, offset: 0 });
  });
  it('rejects entire evidence bundle when a later model dependency fails', async () => {
    const orchestrator = new ProjectExportsOrchestrator({} as never);
    const build = jest.spyOn(orchestrator, 'buildModel').mockImplementation(async (_id, type) => { if (type === 'quotes') throw new Error('quotes dependency failed'); return { title: type, generatedAt: '2026-10-04', sections: [] }; });
    await expect(orchestrator.buildBundleModels(id, 'evidence')).rejects.toThrow('quotes dependency failed'); expect(build.mock.calls).toEqual([[id, 'codebook'], [id, 'evidence'], [id, 'quotes']]);
  });
});

describe("project export bundle scopes", () => {
  it("defines explicit package variants for protocol, evidence, report and all", () => {
    expect(PROJECT_EXPORT_BUNDLE_SCOPES).toEqual([
      "protocol",
      "evidence",
      "report",
      "all",
    ]);
  });

  it("maps each package variant to the right export models", () => {
    expect(getProjectExportTypesForBundleScope("protocol")).toEqual(["protocol"]);
    expect(getProjectExportTypesForBundleScope("evidence")).toEqual([
      "codebook",
      "evidence",
      "quotes",
    ]);
    expect(getProjectExportTypesForBundleScope("report")).toEqual([
      "dashboard",
      "insights",
    ]);
    expect(getProjectExportTypesForBundleScope("all")).toEqual([
      "protocol",
      "codebook",
      "evidence",
      "quotes",
      "dashboard",
      "insights",
    ]);
  });
});
