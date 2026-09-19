import type {
  ExternalAudioOverlayCatalog,
  ExternalAudioOverlaySound,
} from "./external-audio-overlay-channel";

export const SOUNDS_PER_PAGE = 6;
export interface SoundWheelPage {
  key: string;
  category: string;
  number: number;
  total: number;
  sounds: ExternalAudioOverlaySound[];
}

export function soundWheelPages(
  catalog: ExternalAudioOverlayCatalog,
): SoundWheelPage[] {
  const groups = catalog.categories.map((category) => ({
    ...category,
    sounds: catalog.sounds.filter((sound) => sound.categoryId === category.id),
  }));
  const known = new Set(catalog.categories.map(({ id }) => id));
  const ungrouped = catalog.sounds.filter(
    (sound) => !known.has(sound.categoryId),
  );
  if (ungrouped.length)
    groups.push({ id: "uncategorized", name: "Sounds", sounds: ungrouped });
  return groups.flatMap(({ id, name, sounds }) => {
    const total = Math.ceil(sounds.length / SOUNDS_PER_PAGE);
    return Array.from({ length: total }, (_, index) => ({
      key: `${id}:${index}`,
      category: name,
      number: index + 1,
      total,
      sounds: sounds.slice(
        index * SOUNDS_PER_PAGE,
        (index + 1) * SOUNDS_PER_PAGE,
      ),
    }));
  });
}

export function wrapPage(
  index: number,
  direction: number,
  count: number,
): number {
  return count ? (((index + direction) % count) + count) % count : 0;
}

const preferenceKey = (scope: string) =>
  `bakbak:external-wheel-page:v1:${scope}`;
export function loadWheelPage(scope: string): string | null {
  try {
    return localStorage.getItem(preferenceKey(scope));
  } catch {
    return null;
  }
}
export function saveWheelPage(scope: string, key: string): void {
  try {
    localStorage.setItem(preferenceKey(scope), key);
  } catch {
    /* Storage is optional; the wheel remains usable. */
  }
}

// Six equal annular sectors, clockwise from twelve o'clock. Keep a small gap
// between adjacent hit targets; text lives inside the same actual button.
export function wheelSegment(index: number): string {
  const point = (radius: number, degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    return `${50 + radius * Math.cos(angle)}% ${50 + radius * Math.sin(angle)}%`;
  };
  const start = -120 + index * 60 + 1;
  const end = start + 58;
  const outer = Array.from({ length: 17 }, (_, i) =>
    point(49, start + ((end - start) * i) / 16),
  );
  const inner = Array.from({ length: 17 }, (_, i) =>
    point(22, end - ((end - start) * i) / 16),
  );
  return `polygon(${[...outer, ...inner].join(",")})`;
}
