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
      metadata: JSON.stringify(
        input.purpose === "screen_share"
          ? {
              serverId: input.serverId,
              channelId: input.channelId,
              participantKind: "screen_share",
              ownerUserId: input.ownerUserId,
            }
          : {
              serverId: input.serverId,
              channelId: input.channelId,
            },
      ),
      ttl: input.ttlSeconds,
    },
  );

  accessToken.addGrant(
    input.purpose === "screen_share"
      ? {
          roomJoin: true,
          room: input.roomName,
          canPublish: true,
          canPublishSources: [
            TrackSource.SCREEN_SHARE,
            TrackSource.SCREEN_SHARE_AUDIO,
          ],
          canSubscribe: false,
          canPublishData: false,
          canUpdateOwnMetadata: false,
        }
      : {
          roomJoin: true,
          room: input.roomName,
          canPublish: true,
          canPublishSources: [
            TrackSource.MICROPHONE,
            TrackSource.CAMERA,
            TrackSource.SCREEN_SHARE,
          ],
          canSubscribe: true,
          canPublishData: true,
          canUpdateOwnMetadata: false,
        },
  );

  return await accessToken.toJwt();
}
