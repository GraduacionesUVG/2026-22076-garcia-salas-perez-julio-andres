import { GET as workflow } from '@/app/api/projects/[id]/workflow/route';
import { GET as participants, POST as createParticipant } from '@/app/api/projects/[id]/participants/route';
import { GET as evaluate } from '@/app/api/projects/[id]/research-design/evaluate/route';
import { requireProjectRole } from '@/src/modules/projects/project.guard';
import { ProjectWorkflowService } from '@/src/modules/projects/project-workflow.service';
import { ParticipantsService } from '@/src/modules/participants/participants.service';
import { ResearchDesignService } from '@/src/modules/research-design/research-design.service';
import { DelimitationService } from '@/src/modules/delimitation/delimitation.service';
jest.mock('@/src/modules/projects/project.guard', () => ({ requireProjectRole: jest.fn() }));
const id = 'aeaac796-d0c8-4806-9dc4-bc37181fa6bf';
const actor = '72643fd2-6efb-46d4-ac29-e41a59547672';
const ctx = { params: Promise.resolve({ id }) };
const req = (query = '') => new Request(`http://localhost/api${query}`);
beforeEach(() => { jest.restoreAllMocks(); jest.resetAllMocks(); (requireProjectRole as jest.Mock).mockResolvedValue({ supabase: {}, user: { id: actor } }); });
describe('remaining measured product handlers', () => {
  it('returns workflow summary unchanged and passes project identity', async () => { const summary = { current_stage: 'analysis', blockers: ['missing-design'] }; const get = jest.spyOn(ProjectWorkflowService.prototype, 'getSummary').mockResolvedValue(summary as never); const response = await workflow(req(), ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, workflow: summary }); expect(get).toHaveBeenCalledWith(id); expect(requireProjectRole).toHaveBeenCalledWith(id, ['owner', 'editor', 'viewer']); });
  it('lists participants with parsed pagination and deletion filters', async () => { const rows = [{ id: actor, alias: 'P-única' }]; const list = jest.spyOn(ParticipantsService.prototype, 'listByProject').mockResolvedValue(rows as never); const response = await participants(req('?limit=7&offset=3&include_deleted=true'), ctx); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, participants: rows }); expect(list).toHaveBeenCalledWith(id, expect.objectContaining({ limit: 7, offset: 3, include_deleted: true })); expect(requireProjectRole).toHaveBeenCalledWith(id, ['owner', 'editor', 'viewer']); });
it('creates participant with trimmed schema inputs and distinct actor', async () => { const row = { id: actor, alias: 'P01' }; const create = jest.spyOn(ParticipantsService.prototype, 'create').mockResolvedValue(row as never); const response = await createParticipant(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify({ alias: ' P01 ', display_name: '  ', attributes: { idioma: 'K’iche’' } }) }), ctx); expect(response.status).toBe(201); expect(await response.json()).toEqual({ ok: true, participant: row }); expect(create).toHaveBeenCalledWith({ projectId: id, actorUserId: actor, input: { alias: 'P01', display_name: null, notes: '', attributes: { idioma: 'K’iche’' } } }); expect(requireProjectRole).toHaveBeenCalledWith(id, ['owner', 'editor']); });
  it('preserves duplicate participant alias conflict without success', async () => { jest.spyOn(ParticipantsService.prototype, 'create').mockRejectedValue({ code: '23505', message: 'private detail' }); const response = await createParticipant(new Request('http://localhost/api', { method: 'POST', body: '{"alias":"P01"}' }), ctx); expect(response.status).toBe(409); expect(await response.json()).toEqual({ ok: false, error: 'PARTICIPANT_ALIAS_ALREADY_EXISTS' }); });
  it('rejects malformed participant JSON without service effects', async () => { const create = jest.spyOn(ParticipantsService.prototype, 'create'); const response = await createParticipant(new Request('http://localhost/api', { method: 'POST', body: '{' }), ctx); expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: 'Invalid JSON body' }); expect(create).not.toHaveBeenCalled(); });
it('evaluates empty research design through real heuristics', async () => { const design = jest.spyOn(ResearchDesignService.prototype, 'getFull').mockResolvedValue({ design: { research_question: '', general_objective: '' }, specific_objectives: [] } as never); const delimitation = jest.spyOn(DelimitationService.prototype, 'getFull').mockResolvedValue({ delimitation: null, items: [] } as never); const response = await evaluate(req(), ctx); expect(response.status).toBe(200); const body = await response.json(); expect(body).toEqual({ ok: true, data: { design: { research_question: '', general_objective: '' }, specific_objectives: [], delimitation: { delimitation: null, items: [] }, evaluation: expect.any(Object) } }); expect(body.data.evaluation).toMatchInlineSnapshot(`
{
  "alignment": {
    "by_field": {
      "general_objective": {
        "checks": {
          "context_place": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "population": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "time_period": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "topic": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
        },
        "explanation": "Todavía no hay suficiente información para evaluar este campo.",
        "issues": [],
        "status": "empty",
      },
      "research_question": {
        "checks": {
          "context_place": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "population": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "time_period": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "topic": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
        },
        "explanation": "Todavía no hay suficiente información para evaluar este campo.",
        "issues": [],
        "status": "empty",
      },
      "specific_objectives": {
        "checks": {
          "context_place": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "population": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "time_period": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
          "topic": {
            "matched_terms": [],
            "source_text": "",
            "status": "not_applicable",
          },
        },
        "explanation": "Todavía no hay suficiente información para evaluar este campo.",
        "issues": [],
        "status": "empty",
      },
    },
    "explanation": "Pregunta vs delimitación: empty. Objetivo general vs delimitación: empty. Objetivos específicos vs delimitación: empty.",
    "issues": [],
    "status": "empty",
  },
  "coherence": {
    "issues": [
      {
        "code": "COHERENCE_INCOMPLETE_BASE",
        "field": "coherence",
        "message": "No se puede evaluar bien la coherencia porque falta la pregunta o el objetivo general.",
        "severity": "critical",
        "suggestion": "Completa primero la pregunta y el objetivo general.",
      },
    ],
    "status": "critical",
  },
  "general_objective": {
    "issues": [
      {
        "code": "GENERAL_OBJECTIVE_EMPTY",
        "field": "general_objective",
        "message": "El objetivo general todavía está vacío.",
        "severity": "critical",
        "suggestion": "Redacta el propósito central del estudio en una sola oración.",
      },
    ],
    "status": "empty",
  },
  "question": {
    "issues": [
      {
        "code": "QUESTION_EMPTY",
        "field": "research_question",
        "message": "La pregunta de investigación todavía está vacía.",
        "severity": "critical",
        "suggestion": "Redacta una pregunta central clara para la investigación.",
      },
    ],
    "status": "empty",
  },
  "specific_objectives": {
    "issues": [
      {
        "code": "SPECIFIC_OBJECTIVES_EMPTY",
        "field": "specific_objectives",
        "message": "Todavía no hay objetivos específicos.",
        "severity": "critical",
        "suggestion": "Agrega objetivos específicos que desglosen operativamente el objetivo general.",
      },
    ],
    "items": [],
    "status": "empty",
  },
  "summary": {
    "alignment_issues": 0,
    "critical_issues": 4,
    "has_general_objective": false,
    "has_question": false,
    "overall_status": "critical",
    "specific_objectives_count": 0,
    "total_issues": 4,
    "warning_issues": 0,
  },
}
`); expect(body.data.evaluation.summary).toEqual(expect.objectContaining({ has_question: false, has_general_objective: false, specific_objectives_count: 0, overall_status: 'critical' })); expect(design).toHaveBeenCalledWith(id); expect(delimitation).toHaveBeenCalledWith(id); expect(requireProjectRole).toHaveBeenCalledWith(id, ['owner', 'editor', 'viewer']); });
  it.each([workflow, participants, evaluate])('rejects invalid project before guard %#', async handler => { const response = await handler(req(), { params: Promise.resolve({ id: 'invalid' }) }); expect(response.status).toBe(400); expect(await response.json()).toEqual({ ok: false, error: handler === workflow ? 'INVALID_PROJECT_ID' : 'Invalid project id' }); expect(requireProjectRole).not.toHaveBeenCalled(); });
  it.each([workflow, participants, evaluate])('enforces project access rejection %#', async handler => { (requireProjectRole as jest.Mock).mockRejectedValue(Object.assign(new Error('FORBIDDEN'), { status: 403 })); const response = await handler(req(), ctx); expect(response.status).toBe(403); expect(await response.json()).toEqual({ ok: false, error: 'FORBIDDEN' }); });
});
