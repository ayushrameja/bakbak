import type { CommunicationEffectEvent } from "../../lib/communication-effects";
import {
  DEFAULT_INTERFACE_SOUND_PREFERENCES,
  type InterfaceSoundCategory,
  type InterfaceSoundPreferences,
} from "./interface-sound-preferences";

export type InterfaceSoundName =
  | "message-received"
  | "voice-self-join"
  | "voice-self-leave"
  | "voice-remote-join"
  | "voice-remote-leave"
  | "screen-share-start"
  | "screen-share-stop"
  | "reconnect-success"
  | "communication-failure";

interface SoundDefinition {
  category: InterfaceSoundCategory;
  gain: number;
}

const SOUND_DEFINITIONS: Record<InterfaceSoundName, SoundDefinition> = {
  "message-received": { category: "messages", gain: 0.88 },
  "voice-self-join": { category: "voice", gain: 0.92 },
  "voice-self-leave": { category: "voice", gain: 0.86 },
  "voice-remote-join": { category: "voice", gain: 0.72 },
  "voice-remote-leave": { category: "voice", gain: 0.68 },
  "screen-share-start": { category: "screen-share", gain: 0.86 },
  "screen-share-stop": { category: "screen-share", gain: 0.8 },
  "reconnect-success": { category: "status", gain: 0.86 },
  "communication-failure": { category: "status", gain: 0.82 },
};

const CATEGORY_PREVIEWS: Record<InterfaceSoundCategory, InterfaceSoundName> = {
  messages: "message-received",
  voice: "voice-self-join",
  "screen-share": "screen-share-start",
  status: "reconnect-success",
};

type AudioContextConstructor = new () => AudioContext;

interface ControllerEnvironment {
  createContext: () => AudioContext | null;
  fetch: typeof globalThis.fetch;
  now: () => number;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

function createBrowserContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Context = window.AudioContext ?? audioWindow.webkitAudioContext;
  return Context ? new Context() : null;
}

function browserEnvironment(): ControllerEnvironment {
  return {
    createContext: createBrowserContext,
    fetch: globalThis.fetch.bind(globalThis),
    now: () => performance.now(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

function soundForEvent(
  event: CommunicationEffectEvent,
): InterfaceSoundName | null {
  switch (event.type) {
    case "message-received":
      return "message-received";
    case "voice-self-joined":
      return "voice-self-join";
    case "voice-self-left":
      return "voice-self-leave";
    case "voice-remote-joined":
      return "voice-remote-join";
    case "voice-remote-left":
      return "voice-remote-leave";
    case "screen-share-started":
      return "screen-share-start";
    case "screen-share-stopped":
      return "screen-share-stop";
    case "signal-restored":
      return "reconnect-success";
    case "signal-interrupted":
      return "communication-failure";
  }
}

export class InterfaceSoundController {
  private readonly environment: ControllerEnvironment;
  private context: AudioContext | null = null;
  private activated = false;
  private preferences = DEFAULT_INTERFACE_SOUND_PREFERENCES;
  private readonly buffers = new Map<
    InterfaceSoundName,
    Promise<AudioBuffer | null>
  >();
  private readonly lastPlayed = new Map<InterfaceSoundName, number>();
  private activeSoundCount = 0;
  private remoteBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRemoteSound: InterfaceSoundName | null = null;

  constructor(environment: Partial<ControllerEnvironment> = {}) {
    this.environment = { ...browserEnvironment(), ...environment };
  }

  setPreferences(preferences: InterfaceSoundPreferences): void {
    this.preferences = preferences;
    if (!preferences.enabled || !preferences.categories.voice) {
      if (this.remoteBatchTimer !== null) {
        this.environment.clearTimeout(this.remoteBatchTimer);
        this.remoteBatchTimer = null;
      }
      this.pendingRemoteSound = null;
    }
  }

  async activate(): Promise<void> {
    this.activated = true;
    try {
      this.context ??= this.environment.createContext();
      if (!this.context) return;
      if (this.context.state === "suspended") await this.context.resume();
      for (const name of Object.keys(
        SOUND_DEFINITIONS,
      ) as InterfaceSoundName[]) {
        void this.load(name);
      }
    } catch {
      // The next user gesture may be able to activate Web Audio.
    }
  }

  play(
    event: CommunicationEffectEvent,
    options: { deafened?: boolean } = {},
  ): void {
    if (!this.activated) return;
    const name = soundForEvent(event);
    if (!name) return;
    const definition = SOUND_DEFINITIONS[name];
    const remote =
      event.type === "voice-remote-joined" ||
      event.type === "voice-remote-left" ||
      ((event.type === "screen-share-started" ||
        event.type === "screen-share-stopped") &&
        event.actor === "remote");
    if (
      !this.preferences.enabled ||
      !this.preferences.categories[definition.category] ||
      (options.deafened &&
        remote &&
        (definition.category === "voice" ||
          definition.category === "screen-share"))
    ) {
      return;
    }

    if (name === "voice-remote-join" || name === "voice-remote-leave") {
      this.pendingRemoteSound ??= name;
      if (this.remoteBatchTimer === null) {
        this.remoteBatchTimer = this.environment.setTimeout(() => {
          const pending = this.pendingRemoteSound;
          this.pendingRemoteSound = null;
          this.remoteBatchTimer = null;
          if (pending) void this.playNow(pending, 1);
        }, 250);
      }
      return;
    }

    const gainScale =
      (event.type === "screen-share-started" ||
        event.type === "screen-share-stopped") &&
      event.actor === "remote"
        ? 0.62
        : 1;
    void this.playNow(name, gainScale);
  }

  async preview(category: InterfaceSoundCategory): Promise<void> {
    await this.activate();
    const name = CATEGORY_PREVIEWS[category];
    if (!this.preferences.enabled || !this.preferences.categories[category]) {
      return;
    }
    await this.playNow(name, 1, true);
  }

  dispose(): void {
    if (this.remoteBatchTimer !== null) {
      this.environment.clearTimeout(this.remoteBatchTimer);
      this.remoteBatchTimer = null;
    }
    this.pendingRemoteSound = null;
    this.buffers.clear();
    this.lastPlayed.clear();
    const context = this.context;
    this.context = null;
    this.activated = false;
    if (context) void context.close().catch(() => undefined);
  }

  private load(name: InterfaceSoundName): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(name);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const context = this.context;
        if (!context) return null;
        const response = await this.environment.fetch(
          `/interface-sounds/${name}.wav`,
        );
        if (!response.ok) return null;
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch {
        return null;
      }
    })();
    this.buffers.set(name, promise);
    return promise;
  }

  private async playNow(
    name: InterfaceSoundName,
    gainScale: number,
    ignoreThrottle = false,
  ): Promise<void> {
    try {
      const context = this.context;
      if (!context || context.state !== "running") return;
      const now = this.environment.now();
      const cooldown =
        name === "message-received"
          ? 350
          : name === "communication-failure"
            ? 2_000
            : 0;
      const previous = this.lastPlayed.get(name) ?? Number.NEGATIVE_INFINITY;
      if (!ignoreThrottle && now - previous < cooldown) return;
      this.lastPlayed.set(name, now);
      const buffer = await this.load(name);
      if (!buffer || this.activeSoundCount >= 3) return;

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.value =
        this.preferences.volume * SOUND_DEFINITIONS[name].gain * gainScale;
      source.connect(gain);
      gain.connect(context.destination);
      this.activeSoundCount += 1;
      source.addEventListener(
        "ended",
        () => {
          this.activeSoundCount = Math.max(0, this.activeSoundCount - 1);
          source.disconnect();
          gain.disconnect();
        },
        { once: true },
      );
      source.start();
    } catch {
      // Interface sounds must never block messaging or call controls.
    }
  }
}

export const interfaceSoundController = new InterfaceSoundController();
