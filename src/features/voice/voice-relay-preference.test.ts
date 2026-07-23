import { describe, expect, it } from "vitest";
import {
  clearRelayPreference,
  loadRelayPreference,
  saveRelayPreference,
} from "./voice-relay-preference";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("voice relay preference", () => {
  it("persists by LiveKit host and expires safely", () => {
    const storage = memoryStorage();
    saveRelayPreference("wss://voice.example.test", 11_000, storage);
    expect(
      loadRelayPreference("wss://voice.example.test/rtc", 10_000, storage),
    ).toBe(11_000);
    expect(
      loadRelayPreference("wss://voice.example.test", 11_001, storage),
    ).toBe(0);
  });

  it("can be cleared after a direct connection succeeds", () => {
    const storage = memoryStorage();
    saveRelayPreference("wss://voice.example.test", 11_000, storage);
    clearRelayPreference("wss://voice.example.test", storage);
    expect(
      loadRelayPreference("wss://voice.example.test", 10_000, storage),
    ).toBe(0);
  });
});
