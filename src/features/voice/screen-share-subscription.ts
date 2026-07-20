export interface ScreenShareSubscriptionPolicy {
  subscribeVideo: boolean;
  videoQuality: "low" | "high";
  subscribeAudio: boolean;
}

export function screenShareSubscriptionPolicy(
  shareId: string,
  watchedShareId: string | null,
  locallyPresented = false,
): ScreenShareSubscriptionPolicy {
  const watched = shareId === watchedShareId;
  return {
    subscribeVideo: locallyPresented || watched,
    videoQuality: locallyPresented || watched ? "high" : "low",
    subscribeAudio: !locallyPresented && watched,
  };
}
