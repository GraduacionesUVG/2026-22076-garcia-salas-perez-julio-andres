export function getRequestId(request: Request) {
  return (
    request.headers.get("x-request-id") ||
    request.headers.get("x-vercel-id") ||
    crypto.randomUUID()
  );
}

export function getClientAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("true-client-ip"),
  ].filter(Boolean);

  return candidates[0] || "unknown";
}

export function getUserAgent(request: Request) {
  return request.headers.get("user-agent") || "unknown";
}