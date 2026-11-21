import type { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { logAiEvent } from "./ai-logger";

export type ReviewResult<T> = {
  output: T;
  source: "ai" | "heuristic";
  model: string | null;
};

// Each provider gets one budget, including SDK retries/model alternatives. Keep
// both attempts below the review routes' 30-second execution limit.
const PROVIDER_BUDGET_MS = 8_000;

async function withinProviderBudget<T>(run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("REVIEW_PROVIDER_TIMEOUT"));
    }, PROVIDER_BUDGET_MS);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Only wrap generation here: authorization, storage, validation and the app's
 * rate limiter must execute outside this fallback boundary. */
export async function runReviewWithFallback<T>(options: {
  gateway: (signal: AbortSignal) => Promise<{ output: T; model: string }>;
  google: (model: LanguageModel, signal: AbortSignal) => Promise<T>;
  heuristic: () => T;
}): Promise<ReviewResult<T>> {
  if (process.env.AI_GATEWAY_API_KEY?.trim()) {
    try {
      const result = await withinProviderBudget(options.gateway);
      return { ...result, source: "ai" };
    } catch {
      // Never log provider errors containing credentials, prompts or drafts.
      logAiEvent("warn", "review.provider_fallback", { provider: "gateway" });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey) {
    try {
      const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
      const output = await withinProviderBudget(async signal => {
        const google = createGoogleGenerativeAI({ apiKey });
        return options.google(google(modelName), signal);
      });
      return { output, source: "ai", model: `google-ai-studio/${modelName}` };
    } catch {
      logAiEvent("warn", "review.provider_fallback", { provider: "google-ai-studio" });
    }
  }

  // Local errors are not provider failures and must not be swallowed.
  return { output: options.heuristic(), source: "heuristic", model: null };
}
