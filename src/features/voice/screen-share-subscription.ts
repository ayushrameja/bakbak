export interface ScreenShareSubscriptionPolicy {
  subscribeVideo: boolean;
  videoQuality: "low" | "high";
  subscribeAudio: boolean;
}

export function screenShareSubscriptionPolicy(
  shareId: string,
  watchedShareId: string | null,
): ScreenShareSubscriptionPolicy {
  const watched = shareId === watchedShareId;
  return {
    subscribeVideo: watched,
    videoQuality: watched ? "high" : "low",
    subscribeAudio: watched,
  };
}
