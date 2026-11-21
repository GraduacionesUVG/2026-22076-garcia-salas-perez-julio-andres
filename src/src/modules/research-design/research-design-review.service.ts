import { generateText, Output, type LanguageModel } from "ai";
import { runReviewWithFallback } from "@/src/lib/ai-review-fallback";
import { buildHeuristicResearchDesignReview } from "./research-design-review.fallback";
import type { DelimitationFullPayload } from "@/src/modules/delimitation/delimitation.service";
import { evaluateResearchDesign } from "./research-design-heuristics";
import type { ResearchDesignFullPayload } from "./research-design.service";
import {
  ResearchDesignAIReviewSchema,
  type ResearchDesignAIReview,
  type ResearchDesignReviewFocus,
} from "./research-design-review.schema";
import {
  buildResearchDesignSystemPrompt,
  buildResearchDesignUserPrompt,
} from "./research-design-review.prompts";

function resolveGatewayModel() {
  return (
    process.env.RESEARCH_DESIGN_REVIEW_MODEL ||
    process.env.DELIMITATION_CHAT_MODEL ||
    "google/gemini-2.0-flash-lite"
  );
}

export type ResearchDesignReviewInput = {
  research_design: ResearchDesignFullPayload;
  delimitation?: DelimitationFullPayload | null;
};

export class ResearchDesignReviewService {
  async review(
    input: ResearchDesignReviewInput,
    focus: ResearchDesignReviewFocus = "full"
  ): Promise<{
    evaluation: ReturnType<typeof evaluateResearchDesign>;
    ai_review: ResearchDesignAIReview;
    model: string | null;
    source: "ai" | "heuristic";
  }> {
    const evaluation = evaluateResearchDesign(
      input.research_design.design,
      input.research_design.specific_objectives,
      input.delimitation ?? undefined
    );

    const model = resolveGatewayModel();
    const objectiveIds = new Set(input.research_design.specific_objectives.map(item => item.id));
    const generate = async (providerModel: LanguageModel, signal: AbortSignal) => {
      const { output } = await generateText({
        model: providerModel,
        system: buildResearchDesignSystemPrompt(),
        prompt: buildResearchDesignUserPrompt({
          data: input.research_design,
          delimitation: input.delimitation ?? null,
          evaluation,
          focus,
        }),
        temperature: focus === "full" ? 0.2 : 0.15,
        maxOutputTokens: 1600,
        maxRetries: 0,
        abortSignal: signal,
        output: Output.object({ schema: ResearchDesignAIReviewSchema }),
      });
      const validated = ResearchDesignAIReviewSchema.parse(output);
      if (validated.issues.some(issue =>
        issue.affected_specific_objective_ids?.some(id => !objectiveIds.has(id)))) {
        throw new Error("REVIEW_UNKNOWN_OBJECTIVE_ID");
      }
      return validated;
    };
    const result = await runReviewWithFallback({
      gateway: async signal => ({ output: await generate(model, signal), model }),
      google: generate,
      heuristic: () => buildHeuristicResearchDesignReview(evaluation, objectiveIds),
    });
    return {
      evaluation,
      ai_review: result.output,
      model: result.model,
      source: result.source,
    };
  }
}
