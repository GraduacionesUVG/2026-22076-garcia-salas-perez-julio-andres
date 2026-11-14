/** A one-element PostgreSQL text[] literal for the SDK's string contains overload. */
export function singleTagArrayLiteral(tag: string): string {
  // The installed SDK joins array inputs without escaping. Quoting every element
  // preserves commas, braces, NULL, and controls; only quotes/backslashes escape
  // in PostgreSQL array input (JSON escaping would change control characters).
  return `{"${tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"}`;
}
