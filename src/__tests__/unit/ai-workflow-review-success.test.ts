const mockRequireProjectRole = jest.fn();
const mockCheckMemoryRateLimit = jest.fn();
const mockResearchGetFull = jest.fn();
const mockDelimitationGetFull = jest.fn();
const mockSampleGetFull = jest.fn();
const mockSampleGetOptions = jest.fn();
const mockResearchReview = jest.fn();
const mockSampleReview = jest.fn();

jest.mock("@/src/modules/projects/project.guard", () => ({
  requireProjectRole: mockRequireProjectRole,
}));
jest.mock("@/src/lib/ai-rate-limit", () => ({
  checkMemoryRateLimit: mockCheckMemoryRateLimit,
  buildRateLimitHeaders: jest.fn(() => ({ "X-RateLimit-Remaining": "3" })),
}));
jest.mock("@/src/modules/research-design/research-design.repo", () => ({
  ResearchDesignRepo: jest.fn(),
}));
jest.mock("@/src/modules/research-design/research-design.service", () => ({
  ResearchDesignService: jest.fn(() => ({ getFull: mockResearchGetFull })),
}));
jest.mock("@/src/modules/delimitation/delimitation.repo", () => ({
  DelimitationRepo: jest.fn(),
}));
jest.mock("@/src/modules/delimitation/delimitation.service", () => ({
  DelimitationService: jest.fn(() => ({ getFull: mockDelimitationGetFull })),
}));
jest.mock("@/src/modules/research-design/research-design-review.service", () => ({
  ResearchDesignReviewService: jest.fn(() => ({ review: mockResearchReview })),
}));
jest.mock("@/src/modules/sample-config/sample-config.repo", () => ({
  SampleConfigRepo: jest.fn(),
}));
jest.mock("@/src/modules/sample-config/sample-config.service", () => ({
  SampleConfigService: jest.fn(() => ({
    getFull: mockSampleGetFull,
    getOptions: mockSampleGetOptions,
  })),
}));
jest.mock("@/src/modules/sample-config/sample-config-review.service", () => ({
  SampleConfigReviewService: jest.fn(() => ({ review: mockSampleReview })),
}));

import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { POST as researchReviewRoute } from "@/app/api/projects/[id]/research-design/review/route";
import { POST as sampleReviewRoute } from "@/app/api/projects/[id]/sample-config/review/route";

const projectId = "00000000-0000-4000-8000-000000000001";

function request(body: object) {
  return new Request(`http://localhost/api/projects/${projectId}/review`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("workflow AI review route contracts", () => {
  const originalKey = process.env.AI_GATEWAY_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "mocked-key";
    mockRequireProjectRole.mockResolvedValue({ supabase: {} });
    mockCheckMemoryRateLimit.mockReturnValue({
      limited: false,
      limit: 4,
      remaining: 3,
      resetAt: Date.now() + 60_000,
      retryAfterSec: 60,
    });
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalKey;
  });

  it(actionEvidenceTitle(
    "research-design.review.generate",
    ["success"],
    "returns a review from mocked dependencies after loading sentinel research-design state"
  ), async () => {
    const researchDesign = {
      design: {
        research_question: "Sentinel research question?",
        general_objective: "Sentinel general objective",
      },
      specific_objectives: [{ id: "sentinel-objective", text: "Sentinel objective" }],
    };
    const delimitation = { delim: { topic: "Sentinel delimitation topic" } };
    const result = {
      evaluation: { score: "mocked" },
      ai_review: { overall_status: "good", issues: [], guiding_questions: [] },
      model: "mocked-research-provider",
      source: "ai",
    };
    mockResearchGetFull.mockResolvedValue(researchDesign);
    mockDelimitationGetFull.mockResolvedValue(delimitation);
    mockResearchReview.mockResolvedValue(result);

    const response = await researchReviewRoute(request({ focus: "question" }), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        design: researchDesign.design,
        specific_objectives: researchDesign.specific_objectives,
        delimitation,
        evaluation: result.evaluation,
        ai_review: result.ai_review,
        meta: { model: result.model, source: result.source },
      },
    });
    expect(mockResearchReview).toHaveBeenCalledWith({
      research_design: researchDesign,
      delimitation,
    }, "question");
    expect(mockResearchReview).toHaveBeenCalledWith(expect.objectContaining({
      research_design: expect.objectContaining({
        design: expect.objectContaining({ research_question: "Sentinel research question?" }),
      }),
    }), expect.any(String));
  });

  it(actionEvidenceTitle(
    "sample-config.review.generate",
    ["success"],
    "returns a review from mocked dependencies after loading sentinel sample-configuration state"
  ), async () => {
    const sampleConfig = {
      config: {
        field_phase: "Sentinel field phase",
        target_sample_size: 12,
      },
      collection_techniques: [{ technique_code: "interview" }],
    };
    const options = { collection_technique_options: [{ code: "interview" }] };
    const result = {
      evaluation: { score: "mocked" },
      ai_review: { overall_status: "warning", issues: [], guiding_questions: [] },
      model: "mocked-sample-provider",
      source: "ai",
    };
    mockSampleGetFull.mockResolvedValue(sampleConfig);
    mockSampleGetOptions.mockResolvedValue(options);
    mockSampleReview.mockResolvedValue(result);

    const response = await sampleReviewRoute(request({ focus: "coverage" }), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        sample_config: sampleConfig,
        evaluation: result.evaluation,
        ai_review: result.ai_review,
        meta: { model: result.model, source: result.source },
      },
    });
    expect(mockSampleReview).toHaveBeenCalledWith({ sample_config: sampleConfig, options }, "coverage");
    expect(mockSampleReview).toHaveBeenCalledWith(expect.objectContaining({
      sample_config: expect.objectContaining({
        config: expect.objectContaining({ field_phase: "Sentinel field phase" }),
      }),
    }), expect.any(String));
  });
});
