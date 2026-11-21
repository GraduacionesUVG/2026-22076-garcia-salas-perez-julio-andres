import { evaluateSampleConfig as evaluate } from '@/src/modules/sample-config/sample-config-review.heuristics';
import type { SampleConfigRow, SampleCollectionTechniqueRow } from '@/src/modules/sample-config/sample-config.repo';
const metadata = { project_id: 'local', revision: 1, created_at: '', updated_at: '', created_by: null, updated_by: null };
const empty: SampleConfigRow = { ...metadata, main_approach_code: null, scope_code: null, field_phase: null, target_sample_size: null, sample_size_rationale: null };
const technique = (is_custom: boolean): SampleCollectionTechniqueRow => ({ ...metadata, id: 't', position: 0, technique_code: is_custom ? null : 'interview', custom_label: is_custom ? 'Diario' : null, is_custom });
describe('sample review heuristic decision outcomes', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('pins completeness and stage with %i populated dimensions', count => {
    const config = { ...empty, ...(count >= 1 ? { main_approach_code: 'qualitative' } : {}), ...(count >= 2 ? { scope_code: 'exploratory' } : {}), ...(count >= 4 ? { field_phase: 'x' } : {}), ...(count >= 5 ? { target_sample_size: 0 } : {}), ...(count >= 6 ? { sample_size_rationale: 'x' } : {}) };
    const result = evaluate(config, count >= 3 ? [technique(false)] : []);
    expect(result.completeness_score).toBe([0, 17, 33, 50, 67, 83, 100][count]);
    expect(result.overall_stage).toBe(count >= 5 ? 'complete' : count >= 3 ? 'in_progress' : 'initial');
    expect(result.missing_fields).toEqual(['main_approach', 'scope', 'collection_techniques', 'field_phase', 'target_sample_size', 'sample_size_rationale'].slice(count));
    expect(result.signals).toHaveLength(6);
    expect(result.target_sample_size).toBe(count >= 5 ? 0 : null);
  });
  it.each([[0, 0, 'warning', 'warning'], [24, 39, 'warning', 'warning'], [25, 40, 'ok', 'ok']])('pins trimmed field/rationale lengths %i/%i', (fieldLength, rationaleLength, fieldStatus, rationaleStatus) => {
    const result = evaluate({ ...empty, field_phase: `  ${'x'.repeat(fieldLength)}  `, sample_size_rationale: `  ${'ñ'.repeat(rationaleLength)}  ` }, []);
    expect(result.field_phase_length).toBe(fieldLength);
    expect(result.rationale_length).toBe(rationaleLength);
    expect(result.signals.find(x => x.field === 'field_phase')?.status).toBe(fieldStatus);
    expect(result.signals.find(x => x.field === 'sample_size_rationale')?.status).toBe(rationaleStatus);
    expect(result.missing_fields.includes('field_phase')).toBe(fieldLength === 0);
    expect(result.missing_fields.includes('sample_size_rationale')).toBe(rationaleLength === 0);
  });
  it('distinguishes single/multiple/custom techniques without mutating input', () => {
    const items = [technique(false), technique(true)];
    const before = JSON.stringify(items);
    expect(evaluate(empty, items)).toMatchObject({ collection_techniques_count: 2, has_custom_techniques: true });
    expect(evaluate(empty, [items[0]])).toMatchObject({ collection_techniques_count: 1, has_custom_techniques: false });
    expect(evaluate(empty, items).signals[2].message).toContain('2 técnicas');
    expect(evaluate(empty, [items[0]]).signals[2].message).toContain('una técnica');
    expect(JSON.stringify(items)).toBe(before);
  });
});
