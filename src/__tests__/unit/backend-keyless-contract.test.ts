import { assertKeylessAiResponse } from "@/__tests__/backend/keyless-ai-contract";

describe("safe keyless AI response contract", () => {
  it.each([
    "AI_GATEWAY_API_KEY no está configurada en el entorno del proyecto.",
    "No hay un proveedor de IA configurado en el entorno del proyecto.",
    "AI_GATEWAY_API_KEY no está configurada.",
    "No hay un proveedor de IA configurado.",
  ])("accepts the unconfigured-provider contract: %s", error => {
    expect(() => assertKeylessAiResponse(500, { ok: false, error })).not.toThrow();
  });
  it.each([
    [200, { ok: false, error: "No hay un proveedor de IA configurado en el entorno del proyecto." }],
    [500, { ok: true, error: "No hay un proveedor de IA configurado en el entorno del proyecto." }],
    [500, { ok: false, error: "upstream fetch failed" }],
    [500, { ok: false, error: "No hay un proveedor de IA configurado en el entorno del proyecto. secret=sensitive-fixture" }],
    [500, { ok: false, error: "No hay un proveedor de IA configurado en el entorno del proyecto.", stack: "sensitive-fixture" }],
    [500, null], [500, { ok: false, error: 123 }],
  ])("rejects wrong, leaked, or malformed provider responses without echoing the body", (status, body) => {
    expect(() => assertKeylessAiResponse(status as number, body)).toThrow("Invalid safe provider-unconfigured response");
  });
});
