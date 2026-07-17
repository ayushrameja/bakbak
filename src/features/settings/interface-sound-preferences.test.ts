import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_INTERFACE_SOUND_PREFERENCES,
  INTERFACE_SOUND_PREFERENCES_KEY,
  loadInterfaceSoundPreferences,
  saveInterfaceSoundPreferences,
} from "./interface-sound-preferences";

describe("interface sound preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults every communication category to 55% volume", () => {
    expect(loadInterfaceSoundPreferences()).toEqual(
      DEFAULT_INTERFACE_SOUND_PREFERENCES,
    );
  });

  it("round-trips device-local master, volume, and category choices", () => {
    const preferences = {
      enabled: false,
      volume: 0.3,
      categories: {
        messages: true,
        voice: false,
        "screen-share": true,
        status: false,
      },
    };
    saveInterfaceSoundPreferences(preferences);
    expect(loadInterfaceSoundPreferences()).toEqual(preferences);
  });

  it("rejects malformed or out-of-range stored values", () => {
    window.localStorage.setItem(
      INTERFACE_SOUND_PREFERENCES_KEY,
      JSON.stringify({
        enabled: true,
        volume: 4,
        categories: {},
      }),
    );
    expect(loadInterfaceSoundPreferences()).toEqual(
      DEFAULT_INTERFACE_SOUND_PREFERENCES,
    );
  });
});
