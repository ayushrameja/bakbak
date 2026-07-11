const DEFAULT_ALLOWED_ORIGINS = [
  "tauri://localhost",
  "http://tauri.localhost",
  "http://localhost:1420",
  "http://127.0.0.1:1420",
] as const;

const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type";

export function readAllowedOrigins(
  value: string | undefined,
): ReadonlySet<string> {
  const configured = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function isRequestOriginAllowed(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = request.headers.get("origin");
  return origin === null || allowedOrigins.has(origin);
}

export function corsHeaders(
  request: Request,
  allowedOrigins: ReadonlySet<string>,
): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");

  if (origin !== null && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}
