import { evaluateResearchDesign as evaluate } from '@/src/modules/research-design/research-design-heuristics';
import type { ResearchDesignRow, SpecificObjectiveRow } from '@/src/modules/research-design/research-design.repo';

const metadata = { project_id: 'local', revision: 1, created_at: '', updated_at: '', created_by: null, updated_by: null };
const design = (research_question: string | null = null, general_objective: string | null = null): ResearchDesignRow => ({ ...metadata, research_question, general_objective });
const objective = (text: string, position = 0): SpecificObjectiveRow => ({ ...metadata, id: `o${position}`, text, position });
const codes = (issues: { code: string }[]) => issues.map(i => i.code);
const question = '¿Cómo perciben estudiantes la educación en Guatemala durante 2026?';
const general = 'Analizar educación estudiantes Guatemala 2026';

describe('research design decision outcomes', () => {
  it('pins null-source empty fields and critical summary independently', () => {
    const result = evaluate(design(), []);
    expect(result.summary).toEqual({ has_question: false, has_general_objective: false, specific_objectives_count: 0, total_issues: 4, critical_issues: 4, warning_issues: 0, alignment_issues: 0, overall_status: 'critical' });
    expect(codes(result.question.issues)).toEqual(['QUESTION_EMPTY']);
    expect(result.alignment.status).toBe('empty');
  });
  it.each([
    ['x'.repeat(24), ['QUESTION_NOT_INTERROGATIVE', 'QUESTION_TOO_SHORT', 'QUESTION_MISSING_POPULATION', 'QUESTION_MISSING_LOCATION', 'QUESTION_MISSING_TIME']],
    ['?'.padEnd(25, 'x'), ['QUESTION_MISSING_POPULATION', 'QUESTION_MISSING_LOCATION', 'QUESTION_MISSING_TIME']],
    ['?'.padEnd(260, 'x'), ['QUESTION_MISSING_POPULATION', 'QUESTION_MISSING_LOCATION', 'QUESTION_MISSING_TIME']],
    ['?'.padEnd(261, 'x'), ['QUESTION_TOO_LONG', 'QUESTION_MISSING_POPULATION', 'QUESTION_MISSING_LOCATION', 'QUESTION_MISSING_TIME']],
    [question, []],
  ])('pins question length/interrogative/hint outcomes for %s', (text, expected) => {
    expect(codes(evaluate(design(text, general), []).question.issues)).toEqual(expected);
  });
  it.each([
    ['La educación', ['GENERAL_OBJECTIVE_NOT_INFINITIVE', 'GENERAL_OBJECTIVE_TOO_SHORT']],
    ['Diseñar educación estudiantes', ['GENERAL_OBJECTIVE_NON_RECOMMENDED_VERB', 'GENERAL_OBJECTIVE_APPLIED_VERB']],
    ['Leer educación estudiantes', ['GENERAL_OBJECTIVE_NON_RECOMMENDED_VERB']],
    ['Analizar y describir educación', ['GENERAL_OBJECTIVE_MULTIPLE_ACTIONS']],
    ['Analizar '.padEnd(241, 'x'), ['GENERAL_OBJECTIVE_TOO_LONG']],
    ['Analizar impacto estudiantes', ['GENERAL_OBJECTIVE_VAGUE_TERM']],
    [general, []],
  ])('pins objective verb/actions/length outcomes for %s', (text, expected) => {
    expect(codes(evaluate(design(question, text), []).general_objective.issues)).toEqual(expected);
  });
  it('pins specific cardinality, duplication and separate per-objective signals', () => {
    expect(codes(evaluate(design(question, general), [objective(general)]).specific_objectives.issues)).toEqual(['SPECIFIC_OBJECTIVES_ONLY_ONE']);
    const items = ['', 'La voz', 'Crear impacto', 'Analizar y describir voces', 'Leer astronomía planetaria', general, general, 'Analizar '.padEnd(221, 'x')].map((text, i) => objective(text, i));
    const result = evaluate(design(question, general), items);
    expect(codes(result.specific_objectives.issues)).toEqual(expect.arrayContaining(['SPECIFIC_OBJECTIVES_TOO_MANY', 'SPECIFIC_OBJECTIVES_POSSIBLE_DUPLICATE']));
    const expected = ['SPECIFIC_OBJECTIVE_EMPTY', 'SPECIFIC_OBJECTIVE_NOT_INFINITIVE', 'SPECIFIC_OBJECTIVE_APPLIED_VERB', 'SPECIFIC_OBJECTIVE_MULTIPLE_ACTIONS', 'SPECIFIC_OBJECTIVE_LOW_ALIGNMENT', 'SPECIFIC_OBJECTIVE_TOO_SIMILAR_TO_GENERAL', 'SPECIFIC_OBJECTIVE_TOO_SIMILAR_TO_GENERAL', 'SPECIFIC_OBJECTIVE_TOO_LONG'];
    result.specific_objectives.items.forEach((item, i) => expect(codes(item.issues)).toContain(expected[i]));
    expect(result.specific_objectives.items.map(i => i.id)).toEqual(items.map(i => i.id));
  });
  it('pins low coherence and missing core concepts rather than a generic warning', () => {
    const result = evaluate(design(question, 'Describir astronomía planetaria'), [objective('Explorar minerales volcánicos')]);
    expect(codes(result.coherence.issues)).toEqual(['COHERENCE_QUESTION_GENERAL_LOW_OVERLAP', 'COHERENCE_LOW_SPECIFIC_COVERAGE', 'COHERENCE_MISSING_CORE_TERMS']);
    expect(codes(evaluate(design(question, general), []).coherence.issues)).toEqual(['COHERENCE_NO_SPECIFICS']);
  });
  it('pins an overall good design without false duplication or vague-term warnings', () => {
    const result = evaluate(design(question, general), [objective('Describir perciben educación estudiantes'), objective('Explorar Guatemala 2026', 1)]);
    expect(result.summary.overall_status).toBe('good');
    expect(result.summary.total_issues).toBe(0);
  });
  it('reports question vague terms and handles zero-content token intersections', () => {
    expect(evaluate(design('¿Qué impacto perciben estudiantes en Guatemala durante 2026?', general), []).question.issues).toEqual([expect.objectContaining({ code: 'QUESTION_VAGUE_TERM', matched_terms: ['impacto'] })]);
    const result = evaluate(design('¿de?', 'de'), [objective('de'), objective('de', 1)]);
    expect(codes(result.coherence.issues)).toContain('COHERENCE_QUESTION_GENERAL_LOW_OVERLAP');
    expect(codes(result.specific_objectives.issues)).not.toContain('SPECIFIC_OBJECTIVES_POSSIBLE_DUPLICATE');
  });
  it.each(['topic', 'population', 'context_place', 'time_period'] as const)('pins aligned/partial/misaligned %s checks across all three fields', dimension => {
    for (const [source, status, suffix] of [['educación', 'aligned', null], ['educación planeta estrella cosmos', 'partially_aligned', 'PARTIAL'], ['planeta estrella', 'misaligned', 'MISALIGNED']] as const) {
      const result = evaluate(design(question, general), [objective(general)], { delim: { [dimension]: source } });
      const codeDimension = { topic: 'TOPIC', population: 'POPULATION', context_place: 'CONTEXT', time_period: 'TIME' }[dimension];
      for (const [field, value] of Object.entries(result.alignment.by_field)) {
        expect(value.checks[dimension].status).toBe(status);
        expect(codes(value.issues)).toEqual(suffix ? [`${field.toUpperCase()}_${codeDimension}_${suffix}`] : []);
      }
      expect(result.summary.alignment_issues).toBe(suffix ? 3 : 0);
    }
  });
  it('retains deterministic bounded Unicode inputs, totals and input ownership', () => {
    for (let i = 0; i < 32; i++) {
      const input = design(`  ${question} ${'🧪'.repeat(i)}  `, general);
      const items = [objective('Describir educación estudiantes', 9), objective('Explorar Guatemala 2026', 2)];
      const before = JSON.stringify({ input, items });
      const result = evaluate(input, items, { delim: { topic: 'EDUCACIÓN', population: null } });
      expect(evaluate(input, items, { delim: { topic: 'EDUCACIÓN', population: null } })).toEqual(result);
      expect(result.alignment.by_field.research_question.checks.topic.matched_terms).toEqual(['educacion']);
      const issues = [...result.question.issues, ...result.general_objective.issues, ...result.specific_objectives.issues, ...result.specific_objectives.items.flatMap(x => x.issues), ...result.coherence.issues, ...result.alignment.issues];
      expect(result.summary.total_issues).toBe(issues.length);
      expect(result.summary.critical_issues).toBe(issues.filter(x => x.severity === 'critical').length);
      expect(result.summary.warning_issues).toBe(issues.filter(x => x.severity === 'warning').length);
      expect(JSON.stringify({ input, items })).toBe(before);
    }
  });
});
