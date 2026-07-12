import {
  handleLiveKitTokenRequest,
  type LiveKitTokenDependencies,
  type TokenSigningInput,
} from "../../livekit-token/handler.ts";

const CHANNEL_ID = "00000000-0000-4000-8000-000000000201";
const SERVER_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-11T12:00:00.000Z");

Deno.test(
  "livekit-token answers an allowed preflight without authentication",
  async () => {
    const dependencies = createDependencies();
    const response = await handleLiveKitTokenRequest(
      new Request("https://example.test/functions/v1/livekit-token", {
        method: "OPTIONS",
        headers: { origin: "tauri://localhost" },
      }),
      dependencies,
    );

    assertEquals(response.status, 204);
    assertEquals(
      response.headers.get("access-control-allow-origin"),
      "tauri://localhost",
    );
  },
);

Deno.test(
  "livekit-token rejects a browser origin outside the allowlist",
  async () => {
    const response = await handleLiveKitTokenRequest(
      makeRequest(CHANNEL_ID, { origin: "https://evil.example" }),
      createDependencies(),
    );

    assertEquals(response.status, 403);
    assertEquals(await readError(response), "origin_not_allowed");
  },
);

Deno.test("livekit-token rejects malformed channel identifiers", async () => {
  const response = await handleLiveKitTokenRequest(
    makeRequest("../../some-room"),
    createDependencies(),
  );

  assertEquals(response.status, 400);
  assertEquals(await readError(response), "invalid_payload");
});

Deno.test("livekit-token rejects malformed token purposes", async () => {
  const response = await handleLiveKitTokenRequest(
    makeRequest(CHANNEL_ID, {}, "admin"),
    createDependencies(),
  );

  assertEquals(response.status, 400);
  assertEquals(await readError(response), "invalid_payload");
});

Deno.test("livekit-token requires an authenticated Supabase user", async () => {
  const response = await handleLiveKitTokenRequest(
    makeRequest(CHANNEL_ID),
    createDependencies({ authenticate: () => Promise.resolve(null) }),
  );

  assertEquals(response.status, 401);
  assertEquals(await readError(response), "unauthorized");
});

Deno.test(
  "livekit-token hides missing, text, and inaccessible channels",
  async () => {
    const response = await handleLiveKitTokenRequest(
      makeRequest(CHANNEL_ID),
      createDependencies({
        findVoiceChannelAccess: () => Promise.resolve(null),
      }),
    );

    assertEquals(response.status, 404);
    assertEquals(await readError(response), "voice_channel_not_found");
  },
);

Deno.test(
  "livekit-token reports missing server configuration after authentication",
  async () => {
    const response = await handleLiveKitTokenRequest(
      makeRequest(CHANNEL_ID),
      createDependencies({ serverUrl: null }),
    );

    assertEquals(response.status, 503);
    assertEquals(await readError(response), "voice_service_unavailable");
  },
);

Deno.test(
  "livekit-token signs a short-lived token for the authorized voice room",
  async () => {
    const signingInputs: TokenSigningInput[] = [];
    const response = await handleLiveKitTokenRequest(
      makeRequest(CHANNEL_ID),
      createDependencies({
        signToken: (input) => {
          signingInputs.push(input);
          return Promise.resolve("signed-token");
        },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    assertEquals(response.status, 200);
    assertEquals(body.token, "signed-token");
    assertEquals(body.serverUrl, "wss://bakbak.livekit.example/");
    assertEquals(body.roomName, `bakbak-voice-${CHANNEL_ID}`);
    assertEquals(body.expiresAt, "2026-07-11T12:05:00.000Z");
    const signingInput = signingInputs[0];
    assert(
      signingInput !== undefined,
      "Expected the signing dependency to be called.",
    );
    assertEquals(signingInput.identity, USER_ID);
    assertEquals(signingInput.ownerUserId, USER_ID);
    assertEquals(signingInput.purpose, "voice");
    assertEquals(signingInput.serverId, SERVER_ID);
    assertEquals(signingInput.channelId, CHANNEL_ID);
    assertEquals(signingInput.ttlSeconds, 300);
  },
);

Deno.test(
  "livekit-token creates an isolated companion identity for screen sharing",
  async () => {
    const signingInputs: TokenSigningInput[] = [];
    const response = await handleLiveKitTokenRequest(
      makeRequest(CHANNEL_ID, {}, "screen_share"),
      createDependencies({
        signToken: (input) => {
          signingInputs.push(input);
          return Promise.resolve("screen-token");
        },
      }),
    );

    assertEquals(response.status, 200);
    const signingInput = signingInputs[0];
    assert(signingInput !== undefined, "Expected a signing input.");
    assert(
      signingInput.identity.startsWith(`screen:${USER_ID}:`),
      "Expected a server-generated screen companion identity.",
    );
    assertEquals(signingInput.ownerUserId, USER_ID);
    assertEquals(signingInput.purpose, "screen_share");
  },
);

Deno.test("livekit-token hides token signer failures", async () => {
  const response = await handleLiveKitTokenRequest(
    makeRequest(CHANNEL_ID, {}, "screen_share"),
    createDependencies({
      signToken: () =>
        Promise.reject(new Error("secret-bearing signer diagnostic")),
    }),
  );

  assertEquals(response.status, 500);
  assertEquals(await readError(response), "token_request_failed");
});

function createDependencies(
  overrides: Partial<LiveKitTokenDependencies> = {},
): LiveKitTokenDependencies {
  return {
    allowedOrigins: new Set(["tauri://localhost"]),
    serverUrl: "wss://bakbak.livekit.example/",
    now: () => NOW,
    authenticate: () => Promise.resolve({ id: USER_ID }),
    findVoiceChannelAccess: (channelId, userId) => {
      assertEquals(channelId, CHANNEL_ID);
      assertEquals(userId, USER_ID);
      return Promise.resolve({
        channelId: CHANNEL_ID,
        serverId: SERVER_ID,
        displayName: "Ayush",
      });
    },
    signToken: () => Promise.resolve("signed-token"),
    ...overrides,
  };
}

function makeRequest(
  channelId: string,
  additionalHeaders: Record<string, string> = {},
  purpose?: string,
): Request {
  return new Request("https://example.test/functions/v1/livekit-token", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
      origin: "tauri://localhost",
      ...additionalHeaders,
    },
    body: JSON.stringify({ channelId, ...(purpose ? { purpose } : {}) }),
  });
}

async function readError(response: Response): Promise<unknown> {
  const body = (await response.json()) as Record<string, unknown>;
  return body.error;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}
