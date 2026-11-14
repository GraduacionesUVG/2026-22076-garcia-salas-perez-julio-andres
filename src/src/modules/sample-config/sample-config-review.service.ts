import { generateText, Output, type LanguageModel } from "ai";
import { runReviewWithFallback } from "@/src/lib/ai-review-fallback";
import { buildHeuristicSampleConfigReview } from "./sample-config-review.fallback";
import { evaluateSampleConfig } from "./sample-config-review.heuristics";
import {
  SampleConfigAIReviewSchema,
  type SampleConfigAIReview,
  type SampleConfigReviewFocus,
} from "./sample-config-review.schema";
import {
  buildSampleConfigReviewSystemPrompt,
  buildSampleConfigReviewUserPrompt,
} from "./sample-config-review.prompts";
import type {
  SampleConfigFullPayload,
  SampleConfigOptionsPayload,
} from "./sample-config.service";

function resolveGatewayModel() {
  return (
    process.env.SAMPLE_CONFIG_REVIEW_MODEL ||
    process.env.DELIMITATION_CHAT_MODEL ||
    "google/gemini-2.0-flash-lite"
  );
}

export type SampleConfigReviewInput = {
  sample_config: SampleConfigFullPayload;
  options: SampleConfigOptionsPayload;
};

export class SampleConfigReviewService {
  async review(
    input: SampleConfigReviewInput,
    focus: SampleConfigReviewFocus = "full"
  ): Promise<{
    evaluation: ReturnType<typeof evaluateSampleConfig>;
    ai_review: SampleConfigAIReview;
    model: string | null;
    source: "ai" | "heuristic";
  }> {
    const evaluation = evaluateSampleConfig(
      input.sample_config.config,
      input.sample_config.collection_techniques
    );

    const model = resolveGatewayModel();
    const generate = async (providerModel: LanguageModel, signal: AbortSignal) => {
      const { output } = await generateText({
        model: providerModel,
        system: buildSampleConfigReviewSystemPrompt(),
        prompt: buildSampleConfigReviewUserPrompt({
          data: input.sample_config,
          options: input.options,
          evaluation,
          focus,
        }),
        temperature: focus === "full" ? 0.2 : 0.15,
        maxOutputTokens: 1600,
        maxRetries: 0,
        abortSignal: signal,
        output: Output.object({ schema: SampleConfigAIReviewSchema }),
      });
      return SampleConfigAIReviewSchema.parse(output);
    };
    const result = await runReviewWithFallback({
      gateway: async signal => ({ output: await generate(model, signal), model }),
      google: generate,
      heuristic: () => buildHeuristicSampleConfigReview(evaluation),
    });
    return {
      evaluation,
      ai_review: result.output,
      model: result.model,
      source: result.source,
    };
  }
}
