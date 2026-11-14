import { CodeCreateSchema, CodeListQuerySchema } from "@/src/modules/analysis/analysis-codes.schema";
import { ResearchDesignReviewRequestSchema } from '@/src/modules/research-design/research-design-review.schema';
import { SampleConfigReviewRequestSchema } from '@/src/modules/sample-config/sample-config-review.schema';
import {
  InsightCreateSchema,
  InsightListQuerySchema,
} from "@/src/modules/analysis/analysis-insights.schema";
import { MemoCreateSchema, MemoListQuerySchema } from "@/src/modules/analysis/analysis-memos.schema";
import {
  DocumentCreateSchema,
  DocumentListQuerySchema,
} from "@/src/modules/documents/documents.schema";
import {
  ParticipantCreateSchema,
  ParticipantListQuerySchema,
} from "@/src/modules/participants/participants.schema";

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

/** Small deterministic generator: no random seed means failures are replayable. */
function generatedValues(seed: number, count: number): unknown[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
  const scalarPool: JsonLike[] = [
    null,
    true,
    false,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "",
    "   ",
    "\u0000\u202e\u{1F600}",
    "x".repeat(251),
    "' OR 1=1 --",
  ];

  const valueAt = (depth: number): JsonLike => {
    const roll = next() % (depth > 1 ? 10 : 7);
    if (roll < 6) return scalarPool[next() % scalarPool.length];
    if (roll < 8) {
      return [
        scalarPool[next() % scalarPool.length],
        depth > 0 ? valueAt(depth - 1) : null,
      ];
    }
    return {
      alias: scalarPool[next() % scalarPool.length],
      nested: depth > 0 ? valueAt(depth - 1) : null,
      "__proto__": "ignored",
    };
  };

  return Array.from({ length: count }, () => valueAt(3));
}

const createSchemas = [
  ["participant", ParticipantCreateSchema],
  ["document", DocumentCreateSchema],
  ["code", CodeCreateSchema],
  ["memo", MemoCreateSchema],
  ["insight", InsightCreateSchema],
] as const;

const listSchemas = [
  ["participant", ParticipantListQuerySchema],
  ["document", DocumentListQuerySchema],
  ["code", CodeListQuerySchema],
  ["memo", MemoListQuerySchema],
  ["insight", InsightListQuerySchema],
] as const;

describe("deterministic adversarial schema corpus", () => {
  it.each([['research', ResearchDesignReviewRequestSchema, 'question'], ['sample', SampleConfigReviewRequestSchema, 'rationale']] as const)('%s review schema rejects generated non-object/unknown-key payloads and retains valid focus', (_name, schema, focus) => {
    expect(schema.safeParse({ focus }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
    for (const candidate of generatedValues(0x7a5c, 100)) {
      expect(schema.safeParse(candidate).success).toBe(false);
    }
    expect(schema.safeParse({ focus, injected: true }).success).toBe(false);
  });
  it.each(createSchemas)(
    "%s create schema never throws for generated JSON-like values",
    (_name, schema) => {
      for (const candidate of generatedValues(0xc0de, 300)) {
        expect(() => schema.safeParse(candidate)).not.toThrow();
      }
    }
  );

  it.each(listSchemas)(
    "%s list schema never throws for generated query shapes",
    (_name, schema) => {
      for (const candidate of generatedValues(0x5eed, 300)) {
        expect(() => schema.safeParse(candidate)).not.toThrow();
      }
    }
  );
});
