export type VoiceLeaveReason = "user" | "switch" | "sign-out" | "teardown";

export type CommunicationEffectEvent =
  | { type: "message-sent" }
  | { type: "message-received" }
  | { type: "microphone-muted" }
  | { type: "microphone-unmuted" }
  | { type: "deafen-enabled" }
  | { type: "deafen-disabled" }
  | { type: "voice-self-joined"; channelName: string }
  | { type: "voice-self-left" }
  | {
      type: "voice-remote-joined";
      participantId: string;
      displayName: string;
    }
  | {
      type: "voice-remote-left";
      participantId: string;
      displayName: string;
    }
  | {
      type: "screen-share-started";
      actor: "self" | "remote";
      displayName?: string;
    }
  | {
      type: "screen-share-stopped";
      actor: "self" | "remote";
      displayName?: string;
    }
  | { type: "signal-restored" }
  | { type: "signal-interrupted" };

export function communicationEffectLabel(
  event: CommunicationEffectEvent,
): string {
  switch (event.type) {
    case "message-sent":
      return "MESSAGE SENT";
    case "message-received":
      return "MESSAGE RECEIVED";
    case "microphone-muted":
      return "MICROPHONE MUTED";
    case "microphone-unmuted":
      return "MICROPHONE LIVE";
    case "deafen-enabled":
      return "ROOM AUDIO DEAFENED";
    case "deafen-disabled":
      return "ROOM AUDIO RESTORED";
    case "voice-self-joined":
      return `VOICE LINKED // ${event.channelName}`;
    case "voice-self-left":
      return "VOICE RELEASED";
    case "voice-remote-joined":
      return `USER LINKED // ${event.displayName}`;
    case "voice-remote-left":
      return `USER DROPPED // ${event.displayName}`;
    case "screen-share-started":
      return "SCREEN LIVE";
    case "screen-share-stopped":
      return "SCREEN CLOSED";
    case "signal-restored":
      return "SIGNAL RESTORED";
    case "signal-interrupted":
      return "SIGNAL INTERRUPTED";
  }
}
