import { describe, expect, it } from "vitest";
import { mockSoundboardCategories, mockSoundboardSounds } from "./mock-catalog";

describe("mock soundboard catalog", () => {
  it("mirrors the complete hosted catalog shape", () => {
    expect(mockSoundboardCategories).toHaveLength(2);
    expect(mockSoundboardSounds).toHaveLength(44);
    expect(new Set(mockSoundboardSounds.map((sound) => sound.id)).size).toBe(
      44,
    );

    const categoryIds = new Set(
      mockSoundboardCategories.map((category) => category.id),
    );
    expect(
      mockSoundboardSounds.every(
        (sound) =>
          categoryIds.has(sound.categoryId) &&
          sound.durationMs > 0 &&
          sound.enabled &&
          sound.assetStatus === "ready",
      ),
    ).toBe(true);
  });

  it("groups built-ins under System and Discord imports under Bakbak", () => {
    const importedCategory = mockSoundboardCategories.find(
      (category) => category.name === "Bakbak",
    );
    const systemCategory = mockSoundboardCategories.find(
      (category) => category.name === "System",
    );
    const importedSounds = mockSoundboardSounds.filter((sound) =>
      sound.objectPath.includes("/discord-"),
    );
    const systemSounds = mockSoundboardSounds.filter(
      (sound) => !sound.objectPath.includes("/discord-"),
    );

    expect(importedCategory).toBeDefined();
    expect(importedCategory?.acceptsUploads).toBe(true);
    expect(systemCategory?.acceptsUploads).toBe(false);
    expect(importedSounds).toHaveLength(21);
    expect(systemSounds).toHaveLength(23);
    expect(
      importedSounds.every(
        (sound) =>
          sound.categoryId === importedCategory?.id &&
          /^.+\/discord-\d+\.mp3$/.test(sound.objectPath),
      ),
    ).toBe(true);
    expect(
      systemSounds.every((sound) => sound.categoryId === systemCategory?.id),
    ).toBe(true);
  });
});
