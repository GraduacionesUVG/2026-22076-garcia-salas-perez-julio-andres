import { randomUUID } from "node:crypto";

export function createRunMarker(
  now: Date = new Date(),
  uuid: string = randomUUID()
): string {
  const timestamp = now
    .toISOString()
    .slice(0, 19)
    .replaceAll("-", "")
    .replaceAll(":", "");

  return `E2E_${timestamp}_${uuid}`;
}
