import { TokenVerifier } from "livekit-server-sdk";
import { signLiveKitToken } from "../../livekit-token/token.ts";

const TEST_API_KEY = "bakbak-test-key";
const TEST_API_SECRET = "local-test-value-with-no-production-access";

Deno.test(
  "LiveKit signer grants microphone and data without video or screen share",
  async () => {
    const token = await signLiveKitToken(
      { apiKey: TEST_API_KEY, apiSecret: TEST_API_SECRET },
      {
        identity: "10000000-0000-4000-8000-000000000001",
        displayName: "Test friend",
        serverId: "00000000-0000-4000-8000-000000000001",
        channelId: "00000000-0000-4000-8000-000000000201",
        roomName: "bakbak-voice-00000000-0000-4000-8000-000000000201",
        ttlSeconds: 300,
      },
    );
    const claims = await new TokenVerifier(
      TEST_API_KEY,
      TEST_API_SECRET,
    ).verify(token);

    assertEquals(claims.sub, "10000000-0000-4000-8000-000000000001");
    assertEquals(claims.name, "Test friend");
    assertEquals(
      claims.metadata,
      JSON.stringify({
        serverId: "00000000-0000-4000-8000-000000000001",
        channelId: "00000000-0000-4000-8000-000000000201",
      }),
    );
    assertEquals(claims.video?.roomJoin, true);
    assertEquals(
      claims.video?.room,
      "bakbak-voice-00000000-0000-4000-8000-000000000201",
    );
    assertEquals(claims.video?.canPublish, true);
    assertEquals(claims.video?.canSubscribe, true);
    assertEquals(claims.video?.canPublishData, true);
    assertEquals(
      JSON.stringify(claims.video?.canPublishSources),
      JSON.stringify(["microphone"]),
    );
    assertEquals(claims.video?.canUpdateOwnMetadata, false);
    assert(
      typeof claims.exp === "number" && typeof claims.nbf === "number",
      "Expected numeric LiveKit token expiry and not-before claims.",
    );
    assertEquals(claims.exp - claims.nbf, 300);
  },
);

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
