import { describe, expect, it } from "vitest";

import {
  buildLiveKitTokenRequest,
  parseLiveKitTokenResponse,
} from "./token-request";

const now = new Date("2026-07-11T00:00:00.000Z");
const response = {
  token: "signed.jwt.token",
  serverUrl: "wss://bakbak.livekit.cloud",
  roomName: "voice-lobby",
  expiresAt: "2026-07-11T00:10:00.000Z",
};

describe("buildLiveKitTokenRequest", () => {
  it("trims and serializes the requested channel", () => {
    expect(buildLiveKitTokenRequest(" channel_123 ")).toEqual({
      channelId: "channel_123",
    });
  });

  it.each(["", "room with spaces", "../admin", "x".repeat(129)])(
    "rejects unsafe channel ID %j",
    (channelId) => {
      expect(() => buildLiveKitTokenRequest(channelId)).toThrow(TypeError);
    },
  );
});

describe("parseLiveKitTokenResponse", () => {
  it("validates and returns a canonical response", () => {
    expect(parseLiveKitTokenResponse(response, now)).toEqual({
      ok: true,
      value: response,
    });
  });

  it("accepts url as a temporary serverUrl alias", () => {
    const { serverUrl, ...withoutServerUrl } = response;

    expect(
      parseLiveKitTokenResponse({ ...withoutServerUrl, url: serverUrl }, now),
    ).toMatchObject({
      ok: true,
      value: { serverUrl },
    });
  });

  it.each([
    [null, "invalid_payload"],
    [{ ...response, token: "" }, "missing_token"],
    [{ ...response, serverUrl: "" }, "missing_server_url"],
    [{ ...response, serverUrl: "https://example.com" }, "invalid_server_url"],
    [{ ...response, expiresAt: "not-a-date" }, "invalid_expiration"],
    [{ ...response, expiresAt: "2026-07-10T00:00:00.000Z" }, "expired"],
    [{ error: "Membership required" }, "server_error"],
  ] as const)("rejects an invalid response with %s", (payload, error) => {
    expect(parseLiveKitTokenResponse(payload, now)).toMatchObject({
      ok: false,
      error,
    });
  });

  it("allows optional room and expiry metadata to be absent", () => {
    expect(
      parseLiveKitTokenResponse(
        { token: response.token, serverUrl: response.serverUrl },
        now,
      ),
    ).toEqual({
      ok: true,
      value: {
        token: response.token,
        serverUrl: response.serverUrl,
        roomName: null,
        expiresAt: null,
      },
    });
  });
});
