// Hand-derived PostgreSQL text[] literals, independent of the production serializer.
export const TAG_FILTER_CASES = [
  { tag: "rare-tag", literal: '{"rare-tag"}' },
  { tag: "alpha,beta", literal: '{"alpha,beta"}' },
  { tag: 'a"b', literal: '{"a\\"b"}' },
  { tag: "{alpha}", literal: '{"{alpha}"}' },
  { tag: "a\\b", literal: '{"a\\\\b"}' },
  { tag: "NULL", literal: '{"NULL"}' },
  { tag: "a\nb\tc\rd", literal: '{"a\nb\tc\rd"}' },
  { tag: "a\u0001b", literal: '{"a\u0001b"}' },
  { tag: "],status.eq.confirmed", literal: '{"],status.eq.confirmed"}' },
  { tag: "x\"},project_id.eq.other", literal: '{"x\\"},project_id.eq.other"}' },
  { tag: "café 🦋", literal: '{"café 🦋"}' },
];
