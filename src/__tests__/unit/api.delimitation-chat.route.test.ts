jest.mock("ai", () => ({
  convertToModelMessages: jest.fn(),
  streamText: jest.fn(),
}));

jest.mock(
  "@ai-sdk/google",
  () => ({
    createGoogleGenerativeAI: jest.fn(),
  }),
  { virtual: true }
);

jest.mock("@/src/modules/projects/project.guard", () => ({
  requireProjectRole: jest.fn(),
}));

jest.mock("@/src/lib/ai-rate-limit", () => ({
  checkMemoryRateLimit: jest.fn(),
  buildRateLimitHeaders: jest.fn(() => ({
    "X-RateLimit-Limit": "12",
    "X-RateLimit-Remaining": "11",
  })),
}));

jest.mock("@/src/lib/ai-logger", () => ({
  logAiEvent: jest.fn(),
  serializeError: jest.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
}));

import { convertToModelMessages, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { checkMemoryRateLimit } from "@/src/lib/ai-rate-limit";
import { requireProjectRole } from "@/src/modules/projects/project.guard";
import { POST } from "@/app/api/projects/[id]/delimitation/chat/route";

const projectId = "00000000-0000-4000-8000-000000000001";

function request() {
  return new Request(
    `http://localhost/api/projects/${projectId}/delimitation/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "message-1",
            role: "user",
            parts: [{ type: "text", text: "Hola Jack" }],
          },
        ],
        draft: { topic: "Aprendizaje híbrido" },
        heuristics: { totalHighlights: 1, signals: [] },
      }),
    }
  );
}

function failedStream(error: Error) {
  return {
    get text() {
      return Promise.reject(error);
    },
    toUIMessageStreamResponse: jest.fn(
      () => new Response("primary stream", { status: 200 })
    ),
  };
}

function successfulStream(text: string) {
  return {
    text: Promise.resolve(text),
    toUIMessageStreamResponse: jest.fn(
      () => new Response("google stream", { status: 200 })
    ),
  };
}

describe("POST delimitation chat", () => {
  const originalGatewayKey = process.env.AI_GATEWAY_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MODEL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.GEMINI_API_KEY = "test-google-key";
    process.env.GEMINI_MODEL = "gemini-test-model";
    (requireProjectRole as jest.Mock).mockResolvedValue({
      user: { id: "qa-owner" },
      supabase: {},
    });
    (checkMemoryRateLimit as jest.Mock).mockReturnValue({
      limited: false,
      limit: 12,
      remaining: 11,
      resetAt: Date.now() + 60_000,
      retryAfterSec: 0,
    });
    (convertToModelMessages as jest.Mock).mockResolvedValue([
      { role: "user", content: "Hola Jack" },
    ]);
    (createGoogleGenerativeAI as jest.Mock).mockReturnValue(
      jest.fn((modelId: string) => ({
        provider: "google.generative-ai",
        modelId,
      }))
    );
  });

  afterAll(() => {
    if (originalGatewayKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = originalGatewayKey;

    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;

    if (originalGeminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalGeminiModel;
  });

  it("uses Google AI Studio directly when the gateway stream fails", async () => {
    delete process.env.GEMINI_MODEL;
    const gatewayError = Object.assign(
      new Error("Free tier requests on this model are rate-limited."),
      {
        name: "GatewayRateLimitError",
        type: "rate_limit_exceeded",
        statusCode: 429,
      }
    );
    const primary = failedStream(gatewayError);
    const google = successfulStream("¿Qué población deseas estudiar?");
    (streamText as jest.Mock)
      .mockReturnValueOnce(primary)
      .mockReturnValueOnce(google);

    const response = await POST(request(), {
      params: Promise.resolve({ id: projectId }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("google stream");
    expect(primary.toUIMessageStreamResponse).not.toHaveBeenCalled();
    expect(google.toUIMessageStreamResponse).toHaveBeenCalledTimes(1);
    expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
      apiKey: "test-google-key",
    });
    expect(streamText).toHaveBeenCalledTimes(2);
    expect(streamText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: expect.objectContaining({
          provider: "google.generative-ai",
          modelId: "gemini-3.5-flash-lite",
        }),
        maxRetries: 0,
      })
    );
  });
});
