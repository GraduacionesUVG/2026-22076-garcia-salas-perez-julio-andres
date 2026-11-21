jest.mock("ai", () => ({
  convertToModelMessages: jest.fn(),
  gateway: jest.fn(),
  streamText: jest.fn(),
  generateText: jest.fn(),
  Output: { object: jest.fn() },
}));
jest.mock("@/src/modules/projects/project.guard", () => ({
  requireProjectRole: jest.fn(),
}));
jest.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: jest.fn() }));
jest.mock("@/src/lib/ai-logger", () => ({ logAiEvent: jest.fn(), serializeError: jest.fn(() => ({})) }));
jest.mock("@/src/lib/ai-rate-limit", () => ({
  checkMemoryRateLimit: jest.fn(),
  buildRateLimitHeaders: jest.fn(() => ({
    "X-RateLimit-Limit": "1",
    "X-RateLimit-Remaining": "0",
    "Retry-After": "60",
  })),
}));

import { convertToModelMessages, gateway, generateText, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { assertKeylessAiResponse } from "@/__tests__/backend/keyless-ai-contract";
import { checkMemoryRateLimit } from "@/src/lib/ai-rate-limit";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { POST as analysisChat } from "@/app/api/projects/[id]/analysis/chat/route";
import { POST as delimitationChat } from "@/app/api/projects/[id]/delimitation/chat/route";
import { POST as delimitationReview } from "@/app/api/projects/[id]/delimitation/review/route";
import { POST as researchChat } from "@/app/api/projects/[id]/research-design/chat/route";
import { POST as researchReview } from "@/app/api/projects/[id]/research-design/review/route";
import { POST as sampleChat } from "@/app/api/projects/[id]/sample-config/chat/route";
import { POST as sampleReview } from "@/app/api/projects/[id]/sample-config/review/route";
import { ResearchDesignReviewService } from "@/src/modules/research-design/research-design-review.service";
import { SampleConfigReviewService } from "@/src/modules/sample-config/sample-config-review.service";
import { ResearchDesignAIReviewSchema } from "@/src/modules/research-design/research-design-review.schema";
import { SampleConfigAIReviewSchema } from "@/src/modules/sample-config/sample-config-review.schema";
import { Output } from "ai";
import { runReviewWithFallback } from "@/src/lib/ai-review-fallback";
import { ResearchDesignService } from "@/src/modules/research-design/research-design.service";
import { DelimitationService } from "@/src/modules/delimitation/delimitation.service";
import { SampleConfigService } from "@/src/modules/sample-config/sample-config.service";

describe('installed review services with provider-only interception', () => {
  const oldKey = process.env.AI_GATEWAY_API_KEY;
  const oldGoogleKey = process.env.GEMINI_API_KEY;
  const row = { project_id: 'local', revision: 1, created_at: '', updated_at: '', created_by: null, updated_by: null };
  const researchInput: Parameters<ResearchDesignReviewService['review']>[0] = { research_design: { design: { ...row, research_question: null, general_objective: null }, specific_objectives: [] } };
  const sampleInput: Parameters<SampleConfigReviewService['review']>[0] = { sample_config: { config: { ...row, actual_sample_size: 0, main_approach_code: null, scope_code: null, field_phase: null, target_sample_size: null, sample_size_rationale: null }, collection_techniques: [], participant_groups: [] }, options: { main_approaches: [], scopes: [], collection_technique_options: [] } };
  const output = { overall_status: 'warning', concise_summary: 'Revisar el protocolo', issues: [], guiding_questions: [], improvement_suggestions: [], strengths: [], coverage_check: { question_vs_general_objective: 'aligned', specific_objectives_vs_question: 'covered', specific_objectives_vs_general_objective: 'covered', approach_scope_alignment: 'aligned', techniques_alignment: 'adequate', sample_size_rationale_alignment: 'supported', field_phase_context: 'clear', explanation: 'Contexto local' }, delimitation_alignment: { topic: 'not_applicable', population: 'not_applicable', context_place: 'not_applicable', time_period: 'not_applicable', explanation: 'Sin delimitación' }, next_step: 'Definir la pregunta' };
  beforeEach(() => { jest.clearAllMocks(); jest.mocked(generateText).mockReset(); process.env.AI_GATEWAY_API_KEY = 'synthetic-local'; process.env.GEMINI_API_KEY = ''; });
  afterAll(() => { if (oldKey === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = oldKey; if (oldGoogleKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGoogleKey; });
  it.each(['research', 'sample'] as const)('returns actual empty evaluation and validated simulated %s review', async kind => {
    const schema = kind === 'research' ? ResearchDesignAIReviewSchema : SampleConfigAIReviewSchema;
    const validated = schema.parse(output);
    jest.mocked(generateText).mockResolvedValueOnce({ output: validated } as Awaited<ReturnType<typeof generateText>>);
    const result = kind === 'research' ? await new ResearchDesignReviewService().review(researchInput) : await new SampleConfigReviewService().review(sampleInput);
    expect(result.ai_review).toEqual(validated);
    expect(result).toMatchObject({ source: 'ai', model: expect.any(String) });
    if ('summary' in result.evaluation) expect(result.evaluation.summary.total_issues).toBe(4);
    else expect(result.evaluation.completeness_score).toBe(0);
    expect(Output.object).toHaveBeenCalledWith({ schema });
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.2, maxOutputTokens: 1600, prompt: expect.stringContaining('local') }));
  });
  it.each(['research', 'sample'] as const)('returns an explicitly local %s review after provider failure', async kind => {
    const failure = new Error('synthetic provider failure');
    jest.mocked(generateText).mockRejectedValueOnce(failure);
    const promise = kind === 'research' ? new ResearchDesignReviewService().review(researchInput, 'question') : new SampleConfigReviewService().review(sampleInput, 'rationale');
    const result = await promise;
    expect(result).toMatchObject({ source: 'heuristic', model: null });
    expect(result.ai_review.concise_summary).toMatch(/heurística/i);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0.15 }));
  });
  it.each(['research', 'sample'] as const)('falls back for simulated malformed-output/schema rejection for %s', async kind => {
    const schema = kind === 'research' ? ResearchDesignAIReviewSchema : SampleConfigAIReviewSchema;
    const invalid = schema.safeParse({ overall_status: 'impossible', concise_summary: '' });
    expect(invalid.success).toBe(false);
    if (invalid.success) throw new Error('Invalid fixture unexpectedly valid');
    jest.mocked(generateText).mockRejectedValueOnce(invalid.error);
    const result = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(result.source).toBe('heuristic');
    expect(schema.safeParse(result.ai_review).success).toBe(true);
  });
  it.each(['research', 'sample'] as const)('evaluates unconfigured %s locally without touching a provider', async kind => {
    delete process.env.AI_GATEWAY_API_KEY;
    const result = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(result).toMatchObject({ source: 'heuristic', model: null });
    const schema = kind === 'research' ? ResearchDesignAIReviewSchema : SampleConfigAIReviewSchema;
    expect(schema.safeParse(result.ai_review).success).toBe(true);
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each(['research', 'sample'] as const)('uses Google directly for %s when only Google is configured', async kind => {
    process.env.AI_GATEWAY_API_KEY = '  ';
    process.env.GEMINI_API_KEY = ' synthetic-google ';
    const googleModel = { provider: 'google.generative-ai', modelId: 'local-model' };
    jest.mocked(createGoogleGenerativeAI).mockReturnValue(jest.fn(() => googleModel) as never);
    jest.mocked(generateText).mockResolvedValueOnce({ output } as never);
    const result = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(result).toMatchObject({ source: 'ai', model: expect.stringMatching(/^google-ai-studio\//) });
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'synthetic-google' });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ model: googleModel, maxRetries: 0, abortSignal: expect.any(AbortSignal) }));
  });

  it.each(['research', 'sample'] as const)('tries Gateway then Google and finally local %s evaluation', async kind => {
    process.env.GEMINI_API_KEY = 'synthetic-google';
    jest.mocked(createGoogleGenerativeAI).mockReturnValue(jest.fn(() => ({ modelId: 'google-local' })) as never);
    jest.mocked(generateText).mockRejectedValue(new Error('provider unavailable'));
    const result = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(result).toMatchObject({ source: 'heuristic', model: null });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(jest.mocked(generateText).mock.calls[0][0].model).toEqual(expect.any(String));
    expect(jest.mocked(generateText).mock.calls[1][0].model).toMatchObject({ modelId: 'google-local' });
  });

  it('rejects invented objective IDs from the provider instead of returning foreign references', async () => {
    jest.mocked(generateText).mockResolvedValueOnce({ output: { ...output, issues: [{ field: 'specific_objectives', severity: 'warning', title: 'Revisar objetivo', explanation: 'Objetivo ajeno', affected_specific_objective_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }] } } as never);
    const result = await new ResearchDesignReviewService().review(researchInput);
    expect(result.source).toBe('heuristic');
    expect(result.ai_review.issues.flatMap(issue => issue.affected_specific_objective_ids ?? [])).toEqual([]);
  });

  it.each(['research', 'sample'] as const)('recovers %s with Google after Gateway fails and preserves the original evaluation', async kind => {
    process.env.GEMINI_API_KEY = 'synthetic-google';
    jest.mocked(createGoogleGenerativeAI).mockReturnValue(jest.fn(() => ({ modelId: 'google-local' })) as never);
    jest.mocked(generateText).mockRejectedValueOnce(new Error('gateway down')).mockResolvedValueOnce({ output } as never);
    const recovered = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(recovered).toMatchObject({ source: 'ai', model: expect.stringMatching(/^google-ai-studio\//) });
    process.env.AI_GATEWAY_API_KEY = '';
    process.env.GEMINI_API_KEY = '';
    const local = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(local.evaluation).toEqual(recovered.evaluation);
  });

  it.each(['research', 'sample'] as const)('validates the actual %s output rather than trusting the SDK contract', async kind => {
    jest.mocked(generateText).mockResolvedValueOnce({ output: { ...output, issues: Array(20).fill({}) } } as never);
    const result = await (kind === 'research' ? new ResearchDesignReviewService().review(researchInput) : new SampleConfigReviewService().review(sampleInput));
    expect(result).toMatchObject({ source: 'heuristic', model: null });
  });

  it('uses real affected objective IDs in local and generative reviews', async () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const input = { ...researchInput, research_design: { ...researchInput.research_design, specific_objectives: [{ ...row, id, text: 'Crear', position: 0 }] } };
    const aiOutput = { ...output, issues: [{ field: 'specific_objectives', severity: 'warning', title: 'Revisar', explanation: 'Revisar objetivo', affected_specific_objective_ids: [id] }] };
    jest.mocked(generateText).mockResolvedValueOnce({ output: aiOutput } as never);
    const ai = await new ResearchDesignReviewService().review(input);
    expect(ai.source).toBe('ai');
    expect(ai.ai_review.issues[0].affected_specific_objective_ids).toEqual([id]);
    delete process.env.AI_GATEWAY_API_KEY;
    const local = await new ResearchDesignReviewService().review(input);
    expect(local.ai_review.issues.flatMap(issue => issue.affected_specific_objective_ids ?? [])).toContain(id);
    expect(ResearchDesignAIReviewSchema.safeParse(local.ai_review).success).toBe(true);
  });
});

describe('bounded review generation fallback', () => {
  const keys = { gateway: process.env.AI_GATEWAY_API_KEY, google: process.env.GEMINI_API_KEY };
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); process.env.AI_GATEWAY_API_KEY = 'local'; process.env.GEMINI_API_KEY = 'local'; });
  afterEach(() => {
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
    if (keys.gateway === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = keys.gateway;
    if (keys.google === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = keys.google;
  });

  it('aborts stalled providers within separate budgets and reaches local fallback', async () => {
    const signals: AbortSignal[] = [];
    const stall = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signals.push(signal);
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    jest.mocked(createGoogleGenerativeAI).mockReturnValue(jest.fn(() => ({ modelId: 'google-local' })) as never);
    const result = runReviewWithFallback({ gateway: signal => stall(signal), google: (_model, signal) => stall(signal), heuristic: () => 'local evaluation' });
    await jest.advanceTimersByTimeAsync(16_000);
    expect(await result).toEqual({ output: 'local evaluation', source: 'heuristic', model: null });
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });

  it('handles provider initialization failure but does not hide a local implementation error', async () => {
    process.env.AI_GATEWAY_API_KEY = '';
    jest.mocked(createGoogleGenerativeAI).mockImplementationOnce(() => { throw new Error('factory failed'); });
    const localError = new Error('local evaluation failed');
    const result = runReviewWithFallback({ gateway: jest.fn(), google: jest.fn(), heuristic: () => { throw localError; } });
    await expect(result).rejects.toBe(localError);
  });
});

const projectId = "00000000-0000-4000-8000-000000000001";
const routes = [
  [actionEvidenceTitle("analysis.chat", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), analysisChat],
  [actionEvidenceTitle("delimitation.chat", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), delimitationChat],
  [actionEvidenceTitle("delimitation.review.evaluate", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), delimitationReview],
  [actionEvidenceTitle("research-design.chat", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), researchChat],
  [actionEvidenceTitle("research-design.review.generate", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), researchReview],
  [actionEvidenceTitle("sample-config.chat", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), sampleChat],
  [actionEvidenceTitle("sample-config.review.generate", ["permissions", "validation", "dependency-failure"], "stops all AI boundaries before the provider"), sampleReview],
] as const;

function request(body: string) {
  return new Request(`http://localhost/api/projects/${projectId}/ai`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json" },
  });
}

function validChatRequest() {
  return request(JSON.stringify({
    messages: [{
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "¿Qué debo delimitar?" }],
    }],
    draft: {},
    heuristics: {},
  }));
}

function expectNoAiBoundaryCalls() {
  expect(gateway).not.toHaveBeenCalled();
  expect(streamText).not.toHaveBeenCalled();
  expect(generateText).not.toHaveBeenCalled();
  expect(convertToModelMessages).not.toHaveBeenCalled();
  expect(createGoogleGenerativeAI).not.toHaveBeenCalled();
}

describe("AI route pre-provider ordering", () => {
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  let consoleError: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;

  beforeAll(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterAll(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "dummy-test-key";
    process.env.GEMINI_API_KEY = "";
    (requireProjectRole as jest.Mock).mockResolvedValue({
      user: { id: "qa-owner" },
      supabase: {},
    });
    (checkMemoryRateLimit as jest.Mock).mockReturnValue({
      limited: false,
      limit: 1,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      retryAfterSec: 60,
    });
  });

  it.each(routes)("%s rejects a strict-schema violation after rate accounting", async (_name, route) => {
    const response = await route(request(JSON.stringify({ unexpected: true })), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(400);
    expect(checkMemoryRateLimit).toHaveBeenCalledTimes(1);
    expectNoAiBoundaryCalls();
  });

  it.each(routes)("%s returns rate limit before parsing an invalid body", async (_name, route) => {
    (checkMemoryRateLimit as jest.Mock).mockReturnValue({
      limited: true,
      limit: 1,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      retryAfterSec: 60,
    });

    const response = await route(request("{"), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(429);
    expect(checkMemoryRateLimit).toHaveBeenCalledTimes(1);
    expectNoAiBoundaryCalls();
  });

  it.each(routes)("%s preserves the appropriate keyless chat or review validation boundary", async (_name, route) => {
    process.env.AI_GATEWAY_API_KEY = "";
    const response = await route(request(JSON.stringify({ unexpected: true })), {
      params: Promise.resolve({ id: projectId }),
    });

    if (route === delimitationReview || route === researchReview || route === sampleReview) {
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: 'Validation error' });
      expect(checkMemoryRateLimit).toHaveBeenCalledTimes(1);
    } else {
      expect(response.status).toBe(500);
      assertKeylessAiResponse(response.status, await response.json());
      expect(checkMemoryRateLimit).not.toHaveBeenCalled();
    }
    expectNoAiBoundaryCalls();
  });

  it.each(routes)("%s stops authorization failures before rate, schema, and AI", async (_name, route) => {
    (requireProjectRole as jest.Mock).mockRejectedValue({
      status: 403,
      message: "Forbidden",
    });
    const response = await route(request(JSON.stringify({ unexpected: true })), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(403);
    expect(checkMemoryRateLimit).not.toHaveBeenCalled();
    expectNoAiBoundaryCalls();
  });

  it.each(['research', 'sample'] as const)('runs the real %s review route and evaluator without AI credentials', async kind => {
    process.env.AI_GATEWAY_API_KEY = '';
    const row = { project_id: projectId, revision: 1, created_at: '', updated_at: '', created_by: null, updated_by: null };
    const spies = [
      jest.spyOn(ResearchDesignService.prototype, 'getFull').mockResolvedValue({ design: { ...row, research_question: '¿Cómo aprenden las personas?', general_objective: null }, specific_objectives: [] }),
      jest.spyOn(DelimitationService.prototype, 'getFull').mockResolvedValue({ delim: { ...row, topic: null, context_place: null, population: null, time_period: null, resources: null }, include: [], exclude: [] }),
      jest.spyOn(SampleConfigService.prototype, 'getFull').mockResolvedValue({ config: { ...row, actual_sample_size: 0, field_phase: 'Entrevistas en la comunidad', main_approach_code: null, scope_code: null, target_sample_size: null, sample_size_rationale: null }, collection_techniques: [], participant_groups: [] }),
      jest.spyOn(SampleConfigService.prototype, 'getOptions').mockResolvedValue({ main_approaches: [], scopes: [], collection_technique_options: [] }),
    ];
    try {
      const response = await (kind === 'research' ? researchReview : sampleReview)(request('{}'), { params: Promise.resolve({ id: projectId }) });
      expect(response.status).toBe(200);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('1');
      const body = await response.json();
      expect(body.data.meta).toEqual({ source: 'heuristic', model: null });
      const schema = kind === 'research' ? ResearchDesignAIReviewSchema : SampleConfigAIReviewSchema;
      expect(schema.safeParse(body.data.ai_review).success).toBe(true);
      expect(body.data.evaluation).toEqual(expect.any(Object));
      expectNoAiBoundaryCalls();
    } finally {
      spies.forEach(spy => spy.mockRestore());
    }
  });

  it.each(['research', 'sample'] as const)('does not turn %s storage errors into successful heuristic reviews', async kind => {
    process.env.AI_GATEWAY_API_KEY = '';
    const service = kind === 'research' ? ResearchDesignService.prototype : SampleConfigService.prototype;
    const spy = jest.spyOn(service, 'getFull').mockRejectedValue(Object.assign(new Error('DATABASE_UNAVAILABLE'), { status: 503 }));
    try {
      const response = await (kind === 'research' ? researchReview : sampleReview)(request('{}'), { params: Promise.resolve({ id: projectId }) });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false, error: 'DATABASE_UNAVAILABLE' });
      expectNoAiBoundaryCalls();
    } finally {
      spy.mockRestore();
    }
  });

  it.each([delimitationReview, researchReview, sampleReview])('keeps application rate limits even with no configured providers', async route => {
    process.env.AI_GATEWAY_API_KEY = '';
    jest.mocked(checkMemoryRateLimit).mockReturnValue({ limited: true, limit: 1, remaining: 0, resetAt: Date.now() + 60_000, retryAfterSec: 60 });
    const response = await route(request('{}'), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(429);
    expectNoAiBoundaryCalls();
  });

  const chatSuccessRoutes = [
    [actionEvidenceTitle("delimitation.chat", ["success"], "returns the mocked chat stream after a valid request"), delimitationChat],
    [actionEvidenceTitle("research-design.chat", ["success"], "returns the mocked chat stream after a valid request"), researchChat],
    [actionEvidenceTitle("sample-config.chat", ["success"], "returns the mocked chat stream after a valid request"), sampleChat],
  ] as const;

  it(actionEvidenceTitle("analysis.chat", ["success", "cleanup"], "streams with mocked provider and creates no durable resources to clean"), async () => {
    const database = new Proxy({}, { get() { throw new Error("Analysis chat must not access persistent storage"); } });
    (requireProjectRole as jest.Mock).mockResolvedValue({ user: { id: "qa-owner" }, supabase: database });
    (convertToModelMessages as jest.Mock).mockResolvedValue([{ role: "user", content: "Explain evidence" }]);
    (streamText as jest.Mock).mockReturnValue({ toUIMessageStreamResponse: () => new Response("analysis-stream", { headers: { "content-type": "text/event-stream" } }) });
    const response = await analysisChat(request(JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Explain evidence" }] }] })), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe("analysis-stream");
    expect(gateway).toHaveBeenCalledWith("openai/gpt-4o-mini");
    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({ messages: [{ role: "user", content: "Explain evidence" }], maxOutputTokens: 360 }));
  });

  it.each(chatSuccessRoutes)("%s", async (_title, route) => {
    (convertToModelMessages as jest.Mock).mockResolvedValue([
      { role: "user", content: "¿Qué debo delimitar?" },
    ]);
    (streamText as jest.Mock).mockReturnValue({
      toUIMessageStreamResponse: jest.fn(() => new Response("mocked stream", { status: 200 })),
    });

    const response = await route(validChatRequest(), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("mocked stream");
    expect(convertToModelMessages).toHaveBeenCalledTimes(1);
    expect(streamText).toHaveBeenCalledTimes(1);
  });
});
