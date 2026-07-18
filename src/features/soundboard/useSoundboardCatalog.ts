import { useCallback, useEffect, useRef, useState } from "react";
import type { DataMode } from "../../lib/types";
import {
  deleteSoundboardSound,
  downloadSoundboardObject,
  loadSoundboardCatalog,
  setSoundboardFavorite,
  subscribeToSoundboardCatalog,
  updateSoundboardMetadata,
  uploadSoundboardClip,
} from "../../lib/soundboard-service";
import { mockSoundboardCategories, mockSoundboardSounds } from "./mock-catalog";
import { SoundBlobCache, soundCacheKey } from "./sound-cache";
import type {
  SoundboardCatalogController,
  SoundboardMetadataInput,
  SoundboardSound,
  SoundboardUploadInput,
} from "./types";

export function useSoundboardCatalog(
  serverId: string | undefined,
  userId: string | undefined,
  mode: DataMode,
): SoundboardCatalogController {
  const [cache] = useState(() => new SoundBlobCache());
  const [categories, setCategories] = useState(mockSoundboardCategories);
  const [sounds, setSounds] = useState<SoundboardSound[]>(
    mode === "mock" ? mockSoundboardSounds : [],
  );
  const [favoriteSoundIds, setFavoriteSoundIds] = useState<Set<string>>(
    new Set(),
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
      setFavoriteSoundIds(new Set());
      setLoading(false);
      setError(null);
      return;
    }
    if (!serverId) {
      setCategories([]);
      setSounds([]);
      setFavoriteSoundIds(new Set());
      setLoading(false);
      return;
    }

    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await loadSoundboardCatalog(serverId, userId);
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
      setFavoriteSoundIds(snapshot.favoriteSoundIds);
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
  }, [cache, mode, prepareSound, serverId, userId]);

  useEffect(() => {
    void reload();
    if (mode !== "live" || !serverId) return;
    return subscribeToSoundboardCatalog(serverId, userId, () => void reload());
  }, [mode, reload, serverId, userId]);

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

  const toggleFavorite = useCallback(
    async (soundId: string): Promise<void> => {
      if (!serverId || !userId) return;
      const wasFavorite = favoriteSoundIds.has(soundId);
      setFavoriteSoundIds((current) => {
        const next = new Set(current);
        if (wasFavorite) next.delete(soundId);
        else next.add(soundId);
        return next;
      });
      if (mode === "mock") return;
      try {
        await setSoundboardFavorite({
          serverId,
          userId,
          soundId,
          favorite: !wasFavorite,
        });
      } catch (caught) {
        setFavoriteSoundIds((current) => {
          const next = new Set(current);
          if (wasFavorite) next.add(soundId);
          else next.delete(soundId);
          return next;
        });
        throw caught;
      }
    },
    [favoriteSoundIds, mode, serverId, userId],
  );

  const uploadSound = useCallback(
    async (input: SoundboardUploadInput): Promise<void> => {
      if (!serverId) throw new Error("Open a Bakbak server before uploading.");
      if (mode === "mock") {
        const category = categories.find((item) => item.acceptsUploads);
        if (!category) throw new Error("Bakbak has no upload category.");
        const sound: SoundboardSound = {
          id: crypto.randomUUID(),
          serverId,
          categoryId: category.id,
          label: input.label.trim(),
          emoji: input.emoji.trim() || "🔊",
          objectPath: `${serverId}/mock/${crypto.randomUUID()}.wav`,
          durationMs: 5_000,
          position: soundsRef.current.length * 10 + 10,
          audioRevision: 1,
          enabled: true,
          createdBy: userId ?? null,
          createdAt: new Date().toISOString(),
          assetStatus: "ready",
        };
        setSounds((current) => [...current, sound]);
        return;
      }
      const sound = await uploadSoundboardClip(serverId, input);
      const readySound = { ...sound, assetStatus: "ready" as const };
      const key = soundCacheKey(sound.id, sound.audioRevision);
      blobs.current.set(key, input.clip);
      await cache.put(key, input.clip);
      setSounds((current) => [
        ...current.filter((item) => item.id !== sound.id),
        readySound,
      ]);
    },
    [cache, categories, mode, serverId, userId],
  );

  const deleteSound = useCallback(
    async (soundId: string): Promise<void> => {
      if (mode !== "mock") await deleteSoundboardSound(soundId);
      setSounds((current) => current.filter((sound) => sound.id !== soundId));
      setFavoriteSoundIds((current) => {
        const next = new Set(current);
        next.delete(soundId);
        return next;
      });
    },
    [mode],
  );

  return {
    categories,
    sounds,
    favoriteSoundIds,
    loading,
    error,
    getBlob,
    retrySound,
    toggleFavorite,
    uploadSound,
    deleteSound,
    updateSound,
  };
}
