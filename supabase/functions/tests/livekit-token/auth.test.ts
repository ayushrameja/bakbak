import { authenticateUserFromClaims } from "../../livekit-token/auth.ts";

const USER_ID = "10000000-0000-4000-8000-000000000001";

Deno.test("claims authentication accepts a verified subject", async () => {
  const calls: string[] = [];
  const user = await authenticateUserFromClaims(
    makeRequest("signed.jwt"),
    (token) => {
      calls.push(token);
      return Promise.resolve({
        data: { claims: { sub: USER_ID, role: "authenticated" } },
        error: null,
      });
    },
  );

  assertEquals(calls, ["signed.jwt"]);
  assertEquals(user, { id: USER_ID });
});

Deno.test(
  "claims authentication rejects malformed authorization without verification",
  async () => {
    let called = false;
    const user = await authenticateUserFromClaims(
      new Request("https://example.test", {
        headers: { authorization: "Basic definitely-not-a-jwt" },
      }),
      () => {
        called = true;
        return Promise.resolve({ data: null, error: null });
      },
    );

    assertEquals(called, false);
    assertEquals(user, null);
  },
);

Deno.test(
  "claims authentication fails closed for verification errors and invalid subjects",
  async () => {
    const verificationError = await authenticateUserFromClaims(
      makeRequest("bad.jwt"),
      () => Promise.resolve({ data: null, error: new Error("invalid") }),
    );
    const invalidSubject = await authenticateUserFromClaims(
      makeRequest("signed.jwt"),
      () =>
        Promise.resolve({
          data: { claims: { sub: "not-a-user-id" } },
          error: null,
        }),
    );

    assertEquals(verificationError, null);
    assertEquals(invalidSubject, null);
  },
);

function makeRequest(token: string): Request {
  return new Request("https://example.test", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
