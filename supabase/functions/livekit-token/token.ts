import { AccessToken, TrackSource } from "livekit-server-sdk";
import type { TokenSigningInput } from "./handler.ts";

export interface LiveKitSigningConfiguration {
  apiKey: string;
  apiSecret: string;
}

export async function signLiveKitToken(
  configuration: LiveKitSigningConfiguration,
  input: TokenSigningInput,
): Promise<string> {
  const accessToken = new AccessToken(
    configuration.apiKey,
    configuration.apiSecret,
    {
      identity: input.identity,
      name: input.displayName,
      metadata: JSON.stringify({
        serverId: input.serverId,
        channelId: input.channelId,
      }),
      ttl: input.ttlSeconds,
    },
  );

  accessToken.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });

  return await accessToken.toJwt();
}
