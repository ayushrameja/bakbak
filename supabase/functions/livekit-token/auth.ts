export interface AuthenticatedClaimUser {
  id: string;
}

type ClaimsResult = {
  data: unknown;
  error: unknown;
};

export async function authenticateUserFromClaims(
  request: Request,
  getClaims: (token: string) => Promise<ClaimsResult>,
): Promise<AuthenticatedClaimUser | null> {
  const token = readBearerToken(request.headers.get("authorization"));

  if (token === null) return null;

  const { data, error } = await getClaims(token);

  if (error !== null || !isRecord(data)) return null;

  const claims = data.claims;

  if (!isRecord(claims) || !isUuid(claims.sub)) return null;

  return { id: claims.sub };
}

function readBearerToken(authorization: string | null): string | null {
  if (authorization === null) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
