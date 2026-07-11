export function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), { status, headers });
}

export function emptyResponse(
  status: number,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(null, { status, headers: extraHeaders });
}
