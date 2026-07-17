export interface ScreenShareSubscriptionPolicy {
  subscribeVideo: true;
  videoQuality: "low" | "high";
  subscribeAudio: boolean;
}

export function screenShareSubscriptionPolicy(
  shareId: string,
  focusedShareId: string | null,
): ScreenShareSubscriptionPolicy {
  const focused = shareId === focusedShareId;
  return {
    subscribeVideo: true,
    videoQuality: focused ? "high" : "low",
    subscribeAudio: focused,
  };
}
