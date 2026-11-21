/** Safe semantic contract: legacy gateway-only and current multi-provider routes. */
export function assertKeylessAiResponse(status: number, body: unknown): void {
  const value = body as { ok?: unknown; error?: unknown } | null;
  if (status !== 500 || !value || value.ok !== false || typeof value.error !== "string"
    || !/^(?:[A-Z][A-Z0-9_]* no está configurada|No hay un proveedor de IA configurado)(?: en el entorno del proyecto)?\.$/u.test(value.error)
    || Object.keys(value).some(key => !["ok", "error"].includes(key))) {
    throw new Error("Invalid safe provider-unconfigured response");
  }
}
