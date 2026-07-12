import { useCallback, useEffect, useRef, useState } from "react";
import type { DataMode } from "../../lib/types";
import {
  downloadSoundboardObject,
  loadSoundboardCatalog,
  subscribeToSoundboardCatalog,
  updateSoundboardMetadata,
} from "../../lib/soundboard-service";
import { mockSoundboardCategories, mockSoundboardSounds } from "./mock-catalog";
import { SoundBlobCache, soundCacheKey } from "./sound-cache";
import type {
  SoundboardCatalogController,
  SoundboardMetadataInput,
  SoundboardSound,
} from "./types";

export function useSoundboardCatalog(
  serverId: string | undefined,
  mode: DataMode,
): SoundboardCatalogController {
  const [cache] = useState(() => new SoundBlobCache());
  const [categories, setCategories] = useState(mockSoundboardCategories);
  const [sounds, setSounds] = useState<SoundboardSound[]>(
    mode === "mock" ? mockSoundboardSounds : [],
  );
  const [loading, setLoading] = useState(mode === "live");
  const [error, setError] = useState<string | null>(null);
  const blobs = useRef(new Map<string, Blob>());
  const soundsRef = useRef(sounds);
  const loadGeneration = useRef(0);

  useEffect(() => {
    soundsRef.current = sounds;
  }, [sounds]);

  const prepareSound = useCallback(
    async (sound: SoundboardSound, generation: number): Promise<void> => {
      const key = soundCacheKey(sound.id, sound.audioRevision);
      try {
        const cached = await cache.get(key);
        const blob =
          cached ?? (await downloadSoundboardObject(sound.objectPath));
        if (!cached) await cache.put(key, blob);
        if (generation !== loadGeneration.current) return;
        blobs.current.set(key, blob);
        setSounds((current) =>
          current.map((item) =>
            item.id === sound.id ? { ...item, assetStatus: "ready" } : item,
          ),
        );
      } catch {
        if (generation !== loadGeneration.current) return;
        setSounds((current) =>
          current.map((item) =>
            item.id === sound.id ? { ...item, assetStatus: "error" } : item,
          ),
        );
      }
    },
    [cache],
  );

  const reload = useCallback(async () => {
    if (mode === "mock") {
      setCategories(mockSoundboardCategories);
      setSounds(mockSoundboardSounds);
      setLoading(false);
      setError(null);
      return;
    }
    if (!serverId) {
      setCategories([]);
      setSounds([]);
      setLoading(false);
      return;
    }

    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadSoundboardCatalog(serverId);
      if (generation !== loadGeneration.current) return;
      const previous = new Map(
        soundsRef.current.map((sound) => [
          soundCacheKey(sound.id, sound.audioRevision),
          sound.assetStatus,
        ]),
      );
      const nextSounds = snapshot.sounds.map((sound) => ({
        ...sound,
        assetStatus:
          previous.get(soundCacheKey(sound.id, sound.audioRevision)) ??
          "loading",
      }));
      setCategories(snapshot.categories);
      setSounds(nextSounds);
      setLoading(false);
      const activeKeys = new Set(
        nextSounds.map((sound) => soundCacheKey(sound.id, sound.audioRevision)),
      );
      void cache.prune(activeKeys);
      nextSounds.forEach((sound) => {
        if (sound.assetStatus !== "ready") void prepareSound(sound, generation);
      });
    } catch (caught) {
      if (generation !== loadGeneration.current) return;
      setLoading(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "Bakbak could not load the soundboard catalog.",
      );
    }
  }, [cache, mode, prepareSound, serverId]);

  useEffect(() => {
    void reload();
    if (mode !== "live" || !serverId) return;
    return subscribeToSoundboardCatalog(serverId, () => void reload());
  }, [mode, reload, serverId]);

  const getBlob = useCallback(
    async (soundId: string): Promise<Blob | null> => {
      const sound = soundsRef.current.find((item) => item.id === soundId);
      if (!sound || mode === "mock") return null;
      const key = soundCacheKey(sound.id, sound.audioRevision);
      const memoryBlob = blobs.current.get(key);
      if (memoryBlob) return memoryBlob;
      const cached = await cache.get(key);
      if (cached) {
        blobs.current.set(key, cached);
        return cached;
      }
      try {
        const blob = await downloadSoundboardObject(sound.objectPath);
        blobs.current.set(key, blob);
        await cache.put(key, blob);
        setSounds((current) =>
          current.map((item) =>
            item.id === sound.id ? { ...item, assetStatus: "ready" } : item,
          ),
        );
        return blob;
      } catch {
        setSounds((current) =>
          current.map((item) =>
            item.id === sound.id ? { ...item, assetStatus: "error" } : item,
          ),
        );
        return null;
      }
    },
    [cache, mode],
  );

  const retrySound = useCallback(
    async (soundId: string): Promise<void> => {
      const sound = soundsRef.current.find((item) => item.id === soundId);
      if (!sound || mode === "mock") return;
      setSounds((current) =>
        current.map((item) =>
          item.id === sound.id ? { ...item, assetStatus: "loading" } : item,
        ),
      );
      await prepareSound(sound, loadGeneration.current);
    },
    [mode, prepareSound],
  );

  const updateSound = useCallback(
    async (soundId: string, input: SoundboardMetadataInput): Promise<void> => {
      if (mode === "mock") {
        setSounds((current) =>
          current.map((sound) =>
            sound.id === soundId
              ? {
                  ...sound,
                  label: input.label.trim(),
                  emoji: input.emoji.trim(),
                  categoryId: input.categoryId,
                }
              : sound,
          ),
        );
        return;
      }
      const updated = await updateSoundboardMetadata(soundId, input);
      setSounds((current) =>
        current.map((sound) =>
          sound.id === soundId
            ? { ...updated, assetStatus: sound.assetStatus }
            : sound,
        ),
      );
    },
    [mode],
  );

  return {
    categories,
    sounds,
    loading,
    error,
    getBlob,
    retrySound,
    updateSound,
  };
}
