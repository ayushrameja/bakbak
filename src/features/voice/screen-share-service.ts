import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ScreenShareLifecycleState =
  "idle" | "selecting" | "starting" | "sharing" | "stopping" | "error";

export interface ScreenShareCapabilities {
  available: boolean;
  nativeCapture: boolean;
  systemAudio: boolean;
  reason: string | null;
}

export interface StartScreenShareInput {
  serverUrl: string;
  token: string;
  includeAudio: boolean;
}

export interface ScreenShareSession {
  sessionId: string;
  sourceLabel: string;
  audioPublished: boolean;
}

export interface ScreenShareLifecycleEvent {
  state: ScreenShareLifecycleState;
  sessionId: string | null;
  sourceLabel: string | null;
  audioPublished: boolean;
  message: string | null;
}

export function isDesktopApp(): boolean {
  return isTauri();
}

export async function getScreenShareCapabilities(): Promise<ScreenShareCapabilities> {
  if (!isTauri()) {
    return {
      available: false,
      nativeCapture: false,
      systemAudio: false,
      reason: "Screen sharing is available in the installed desktop app.",
    };
  }

  return await invoke<ScreenShareCapabilities>("get_screen_share_capabilities");
}

export async function startScreenShare(
  input: StartScreenShareInput,
): Promise<ScreenShareSession> {
  if (!isTauri()) {
    throw new Error(
      "Screen sharing is available in the installed desktop app.",
    );
  }

  try {
    return await invoke<ScreenShareSession>("start_screen_share", {
      request: input,
    });
  } catch (caught) {
    console.error(`[Bakbak screen share] ${describeNativeError(caught)}`);
    throw caught;
  }
}

export async function stopScreenShare(sessionId: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("stop_screen_share", { sessionId });
}

export async function listenForScreenShareLifecycle(
  onEvent: (event: ScreenShareLifecycleEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => undefined;
  return await listen<ScreenShareLifecycleEvent>(
    "screen-share-lifecycle",
    ({ payload }) => {
      if (payload.state === "error") {
        console.error(
          `[Bakbak screen share] ${payload.message ?? "Native screen sharing stopped unexpectedly."}`,
        );
      }
      onEvent(payload);
    },
  );
}

function describeNativeError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string" && caught.trim()) return caught;
  return "Native screen sharing failed without an error message.";
}
