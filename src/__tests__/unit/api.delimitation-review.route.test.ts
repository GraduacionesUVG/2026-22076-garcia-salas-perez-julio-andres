jest.mock("ai", () => ({
  generateText: jest.fn(),
  Output: { object: jest.fn(() => ({ type: "object-output" })) },
}));

jest.mock(
  "@ai-sdk/google",
  () => ({
    createGoogleGenerativeAI: jest.fn(),
  })
);

jest.mock("@/src/modules/projects/project.guard", () => ({
  requireProjectRole: jest.fn(),
}));

jest.mock("@/src/lib/ai-rate-limit", () => ({
  checkMemoryRateLimit: jest.fn(),
  buildRateLimitHeaders: jest.fn(() => ({
    "X-RateLimit-Limit": "4",
    "X-RateLimit-Remaining": "3",
  })),
}));

jest.mock("@/src/lib/ai-logger", () => ({
  logAiEvent: jest.fn(),
  serializeError: jest.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
}));

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { checkMemoryRateLimit } from "@/src/lib/ai-rate-limit";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { actionEvidenceTitle } from "@/__tests__/backend/action-evidence";
import { POST } from "@/app/api/projects/[id]/delimitation/review/route";
import { DelimitationReviewOutputSchema } from "@/src/modules/delimitation/delimitation-review.schema";

const projectId = "00000000-0000-4000-8000-000000000001";

const validReview = {
  summary: "La delimitacion necesita completar algunos campos.",
  overall: {
    score: 58,
    verdict: "mejorable",
    rationale: "El tema esta definido, pero faltan tiempo y poblacion.",
  },
  fields: {
    topic: {
      score: 80,
      status: "aceptable",
      note: "El tema es comprensible.",
      priority: "baja",
    },
    context_place: {
      score: 70,
      status: "aceptable",
      note: "El contexto esta acotado.",
      priority: "media",
    },
    time_period: {
      score: 0,
      status: "pendiente",
      note: "Falta definir el periodo.",
      priority: "alta",
    },
    population: {
      score: 0,
      status: "pendiente",
      note: "Falta definir la poblacion.",
      priority: "alta",
    },
    resources: {
      score: 60,
      status: "aceptable",
      note: "Los recursos son plausibles.",
      priority: "media",
    },
    include: {
      score: 0,
      status: "pendiente",
      note: "Faltan criterios de inclusion.",
      priority: "media",
    },
    exclude: {
      score: 0,
      status: "pendiente",
      note: "Faltan criterios de exclusion.",
      priority: "media",
    },
  },
  findings: [],
  jackQuestion: "Que periodo concreto vas a estudiar?",
  suggestedNextStep: "Define el periodo y la poblacion.",
};

function request() {
  return new Request(
    `http://localhost/api/projects/${projectId}/delimitation/review`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        draft: {
          topic: "Experiencias de aprendizaje digital",
          context_place: "Ciudad de Guatemala",
        },
        heuristics: {
          totalHighlights: 2,
          signals: [],
        },
      }),
    }
  );
}

function noOutputResult() {
  return {
    finishReason: "length",
    get output() {
      throw new Error("No output generated.");
    },
  };
}

describe("POST delimitation review", () => {
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MODEL;
  const originalReviewModel = process.env.DELIMITATION_REVIEW_MODEL;
  const originalFallbackModels =
    process.env.DELIMITATION_REVIEW_FALLBACK_MODELS;

  beforeEach(() => {
    jest.clearAllMocks();
    (generateText as jest.Mock).mockReset();
    process.env.AI_GATEWAY_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-google-key";
    process.env.GEMINI_MODEL = "gemini-test-model";
    process.env.DELIMITATION_REVIEW_MODEL =
      "google/gemini-2.5-flash-lite";
    process.env.DELIMITATION_REVIEW_FALLBACK_MODELS =
      "inclusionai/ling-3.0-tiny-free,poolside/laguna-s-2.1-free";
    (requireProjectRole as jest.Mock).mockResolvedValue({
      user: { id: "qa-owner" },
      supabase: {},
    });
    (checkMemoryRateLimit as jest.Mock).mockReturnValue({
      limited: false,
      limit: 4,
      remaining: 3,
      resetAt: Date.now() + 60_000,
      retryAfterSec: 0,
    });
    (createGoogleGenerativeAI as jest.Mock).mockReturnValue(
      jest.fn((modelId: string) => ({
        provider: "google.generative-ai",
        modelId,
      }))
    );
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalKey;

    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;

    if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalGeminiModel;

    if (originalReviewModel === undefined) {
      delete process.env.DELIMITATION_REVIEW_MODEL;
    } else {
      process.env.DELIMITATION_REVIEW_MODEL = originalReviewModel;
    }

    if (originalFallbackModels === undefined) {
      delete process.env.DELIMITATION_REVIEW_FALLBACK_MODELS;
    } else {
      process.env.DELIMITATION_REVIEW_FALLBACK_MODELS =
        originalFallbackModels;
    }
  });

  it(actionEvidenceTitle(
    "delimitation.review.evaluate",
    ["success"],
    "returns a validated mocked provider review after an incomplete first response"
  ), async () => {
    process.env.GEMINI_API_KEY = "";
    (generateText as jest.Mock)
      .mockResolvedValueOnce(noOutputResult())
      .mockResolvedValueOnce({
        finishReason: "stop",
        output: validReview,
      });

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      review: {
        overall: {
          score: 58,
          verdict: "mejorable",
        },
      },
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 0,
              includeThoughts: false,
            },
          },
        },
      })
    );
  });

  it("uses a stronger economical gateway model when the primary output is incomplete", async () => {
    process.env.GEMINI_API_KEY = "";
    (generateText as jest.Mock)
      .mockResolvedValueOnce(noOutputResult())
      .mockResolvedValueOnce(noOutputResult())
      .mockResolvedValueOnce({
        finishReason: "stop",
        text: JSON.stringify(validReview),
      });

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      review: {
        source: "ai",
        overall: { score: 58, verdict: "mejorable" },
      },
    });
    expect(generateText).toHaveBeenCalledTimes(3);
    expect(generateText).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ model: "inclusionai/ling-3.0-tiny-free" })
    );
    expect((generateText as jest.Mock).mock.calls[2][0]).not.toHaveProperty(
      "output"
    );
    expect((generateText as jest.Mock).mock.calls[2][0].prompt).toContain(
      "Devuelve exclusivamente JSON válido"
    );
  });

  it("uses a fallback gateway model when the primary is rate limited", async () => {
    process.env.GEMINI_API_KEY = "";
    const gatewayError = Object.assign(
      new Error("Free tier requests on this model are rate-limited."),
      {
        name: "GatewayRateLimitError",
        type: "rate_limit_exceeded",
        statusCode: 429,
      }
    );
    (generateText as jest.Mock)
      .mockRejectedValueOnce(gatewayError)
      .mockResolvedValueOnce({
        finishReason: "stop",
        text: JSON.stringify(validReview),
      });

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      review: {
        source: "ai",
        overall: { score: 58, verdict: "mejorable" },
      },
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "inclusionai/ling-3.0-tiny-free" })
    );
  });

  it("uses Google AI Studio directly when the gateway model fails", async () => {
    delete process.env.GEMINI_MODEL;
    const gatewayError = Object.assign(
      new Error("Free tier requests on this model are rate-limited."),
      {
        name: "GatewayRateLimitError",
        type: "rate_limit_exceeded",
        statusCode: 429,
      }
    );
    (generateText as jest.Mock)
      .mockRejectedValueOnce(gatewayError)
      .mockResolvedValueOnce({
        finishReason: "stop",
        output: validReview,
      });

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      review: {
        source: "ai",
        overall: { score: 58, verdict: "mejorable" },
      },
    });
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: "test-google-key",
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: expect.objectContaining({
          provider: "google.generative-ai",
          modelId: "gemini-3.5-flash-lite",
        }),
      })
    );
    expect((generateText as jest.Mock).mock.calls[1][0]).not.toHaveProperty(
      "providerOptions"
    );
  });

  it('returns a schema-valid local review when neither provider is configured', async () => {
    process.env.AI_GATEWAY_API_KEY = ' ';
    process.env.GEMINI_API_KEY = '';
    const response = await POST(request(), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, review: { source: 'heuristic', model: null } });
    expect(generateText).not.toHaveBeenCalled();
    expect(createGoogleGenerativeAI).not.toHaveBeenCalled();
  });

  it('does not attempt Gateway when only Google is configured', async () => {
    process.env.AI_GATEWAY_API_KEY = '';
    jest.mocked(generateText).mockResolvedValueOnce({ finishReason: 'stop', output: validReview } as never);
    const response = await POST(request(), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ review: { source: 'ai', model: 'google-ai-studio/gemini-test-model' } });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ model: expect.objectContaining({ provider: 'google.generative-ai' }) }));
  });

  it('falls back locally on an ordinary provider outage without Google', async () => {
    process.env.GEMINI_API_KEY = '';
    jest.mocked(generateText).mockRejectedValueOnce(new Error('provider offline'));
    const response = await POST(request(), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ review: { source: 'heuristic', model: null } });
  });

  it('keeps local output within schema limits for valid long client hints', async () => {
    process.env.AI_GATEWAY_API_KEY = '';
    process.env.GEMINI_API_KEY = '';
    const response = await POST(new Request('http://localhost/review', { method: 'POST', body: JSON.stringify({ draft: { topic: 'Aprendizaje digital' }, heuristics: { jackQuestion: '¿'.repeat(300), signals: [{ field: 'topic', level: 'muy amplio', text: 'x'.repeat(1000) }] } }) }), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    const { review } = await response.json();
    expect(DelimitationReviewOutputSchema.safeParse(review).success).toBe(true);
  });

  it("skips models restricted on the free tier and continues through AI Gateway", async () => {
    process.env.GEMINI_API_KEY = "";
    const restrictedModelError = Object.assign(
      new Error("Free tier users do not have access to this model."),
      {
        name: "AI_APICallError",
        statusCode: 403,
      }
    );
    (generateText as jest.Mock)
      .mockRejectedValueOnce(restrictedModelError)
      .mockResolvedValueOnce({
        finishReason: "stop",
        text: JSON.stringify(validReview),
      });

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      review: {
        source: "ai",
        overall: { score: 58, verdict: "mejorable" },
      },
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: "inclusionai/ling-3.0-tiny-free" })
    );
  });

  it("uses the heuristic review only after every gateway model is exhausted", async () => {
    process.env.GEMINI_API_KEY = "";
    (generateText as jest.Mock).mockResolvedValue(noOutputResult());

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      review: {
        source: "heuristic",
        overall: {
          score: expect.any(Number),
          verdict: expect.any(String),
        },
      },
    });
    expect(generateText).toHaveBeenCalledTimes(6);
  });
});
