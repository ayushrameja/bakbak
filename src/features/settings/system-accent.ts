import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SystemAccentSource = "macos" | "windows" | "fallback";
export type ResolvedColorScheme = "light" | "dark";

export interface SystemAccent {
  red: number;
  green: number;
  blue: number;
  source: SystemAccentSource;
}

export interface AppliedSystemAccent extends SystemAccent {
  color: string;
  onAccent: "#000000" | "#ffffff";
  scheme: ResolvedColorScheme;
}

interface Rgb {
  red: number;
  green: number;
  blue: number;
}

interface SystemAccentRuntime {
  root: HTMLElement;
  window: Window;
  previewAccent?: SystemAccent | undefined;
  isNative: () => boolean;
  queryNative: () => Promise<unknown>;
  listenNative: (onAccent: (payload: unknown) => void) => Promise<UnlistenFn>;
}

export const NEUTRAL_SYSTEM_ACCENT: SystemAccent = Object.freeze({
  red: 128,
  green: 128,
  blue: 128,
  source: "fallback",
});

const PREVIEW_ACCENTS: Record<string, SystemAccent> = {
  red: { red: 255, green: 59, blue: 48, source: "fallback" },
  blue: { red: 10, green: 132, blue: 255, source: "fallback" },
  graphite: NEUTRAL_SYSTEM_ACCENT,
};

const DARK_CANVAS: Rgb = { red: 9, green: 9, blue: 9 };
const LIGHT_CANVAS: Rgb = { red: 250, green: 250, blue: 250 };
const TEXT_CONTRAST_TARGET = 4.5;
const listeners = new Set<(accent: AppliedSystemAccent) => void>();

let currentAccent: SystemAccent = NEUTRAL_SYSTEM_ACCENT;
let appliedAccent: AppliedSystemAccent | undefined;
let runtimeCleanup: (() => void) | undefined;
let startPromise: Promise<void> | undefined;
let syncGeneration = 0;

function isByte(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

export function parseSystemAccent(value: unknown): SystemAccent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<SystemAccent>;
  if (
    !isByte(candidate.red) ||
    !isByte(candidate.green) ||
    !isByte(candidate.blue) ||
    (candidate.source !== "macos" &&
      candidate.source !== "windows" &&
      candidate.source !== "fallback")
  ) {
    return undefined;
  }

  return {
    red: candidate.red,
    green: candidate.green,
    blue: candidate.blue,
    source: candidate.source,
  };
}

export function readPreviewSystemAccent(
  search: string,
): SystemAccent | undefined {
  const value = new URLSearchParams(search).get("accent")?.toLowerCase();
  return value ? PREVIEW_ACCENTS[value] : undefined;
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * linearize(color.red) +
    0.7152 * linearize(color.green) +
    0.0722 * linearize(color.blue)
  );
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function mix(first: Rgb, second: Rgb, amount: number): Rgb {
  return {
    red: Math.round(first.red + (second.red - first.red) * amount),
    green: Math.round(first.green + (second.green - first.green) * amount),
    blue: Math.round(first.blue + (second.blue - first.blue) * amount),
  };
}

export function normalizeSystemAccent(
  accent: Rgb,
  scheme: ResolvedColorScheme,
): Rgb {
  const canvas = scheme === "dark" ? DARK_CANVAS : LIGHT_CANVAS;
  if (contrastRatio(accent, canvas) >= TEXT_CONTRAST_TARGET) return accent;

  const destination =
    scheme === "dark"
      ? { red: 255, green: 255, blue: 255 }
      : { red: 0, green: 0, blue: 0 };
  let low = 0;
  let high = 1;

  for (let index = 0; index < 12; index += 1) {
    const midpoint = (low + high) / 2;
    const candidate = mix(accent, destination, midpoint);
    if (contrastRatio(candidate, canvas) >= TEXT_CONTRAST_TARGET) {
      high = midpoint;
    } else {
      low = midpoint;
    }
  }

  return mix(accent, destination, high);
}

function toCssRgb(color: Rgb): string {
  return `rgb(${color.red} ${color.green} ${color.blue})`;
}

function toHex(color: Rgb): string {
  return `#${[color.red, color.green, color.blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function chooseOnAccent(color: Rgb): "#000000" | "#ffffff" {
  const black = { red: 0, green: 0, blue: 0 };
  const white = { red: 255, green: 255, blue: 255 };
  return contrastRatio(color, black) >= contrastRatio(color, white)
    ? "#000000"
    : "#ffffff";
}

export function resolveColorScheme(
  root: HTMLElement = document.documentElement,
  browserWindow: Window = window,
): ResolvedColorScheme {
  if (root.dataset.colorScheme === "light") return "light";
  if (root.dataset.colorScheme === "dark") return "dark";
  if (typeof browserWindow.matchMedia !== "function") return "dark";
  return browserWindow.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applySystemAccent(
  accent: SystemAccent,
  root: HTMLElement = document.documentElement,
  browserWindow: Window = window,
): AppliedSystemAccent {
  const scheme = resolveColorScheme(root, browserWindow);
  const normalized = normalizeSystemAccent(accent, scheme);
  const color = toHex(normalized);
  const onAccent = chooseOnAccent(normalized);

  root.style.setProperty("--system-accent-raw", toCssRgb(accent));
  root.style.setProperty("--system-accent", color);
  root.style.setProperty("--system-accent-on", onAccent);
  root.style.setProperty(
    "--system-accent-soft",
    `color-mix(in srgb, ${color} 16%, transparent)`,
  );
  root.style.setProperty(
    "--system-accent-hover",
    `color-mix(in srgb, ${color} 8%, transparent)`,
  );
  root.style.setProperty(
    "--system-accent-surface",
    `color-mix(in srgb, ${color} 6%, transparent)`,
  );
  root.style.setProperty(
    "--system-accent-border",
    `color-mix(in srgb, ${color} 38%, transparent)`,
  );
  root.dataset.systemAccentSource = accent.source;

  currentAccent = accent;
  appliedAccent = { ...accent, color, onAccent, scheme };
  for (const listener of listeners) listener(appliedAccent);
  return appliedAccent;
}

export function reapplySystemAccent(): AppliedSystemAccent {
  return applySystemAccent(currentAccent);
}

export function getCurrentSystemAccent(): AppliedSystemAccent {
  return appliedAccent ?? applySystemAccent(currentAccent);
}

export function subscribeSystemAccent(
  listener: (accent: AppliedSystemAccent) => void,
): () => void {
  listeners.add(listener);
  listener(getCurrentSystemAccent());
  return () => listeners.delete(listener);
}

function defaultRuntime(): SystemAccentRuntime {
  return {
    root: document.documentElement,
    window,
    previewAccent: import.meta.env.DEV
      ? readPreviewSystemAccent(window.location.search)
      : undefined,
    isNative: isTauri,
    queryNative: () => invoke<unknown>("get_system_accent"),
    listenNative: (onAccent) =>
      listen<unknown>("system-accent-changed", (event) =>
        onAccent(event.payload),
      ),
  };
}

async function queryAndApply(runtime: SystemAccentRuntime): Promise<void> {
  try {
    const payload = parseSystemAccent(await runtime.queryNative());
    applySystemAccent(
      payload ?? NEUTRAL_SYSTEM_ACCENT,
      runtime.root,
      runtime.window,
    );
  } catch {
    applySystemAccent(NEUTRAL_SYSTEM_ACCENT, runtime.root, runtime.window);
  }
}

async function startRuntime(runtime: SystemAccentRuntime): Promise<() => void> {
  applySystemAccent(
    runtime.previewAccent ?? NEUTRAL_SYSTEM_ACCENT,
    runtime.root,
    runtime.window,
  );

  const media =
    typeof runtime.window.matchMedia === "function"
      ? runtime.window.matchMedia("(prefers-color-scheme: dark)")
      : undefined;
  const handleSchemeChange = () =>
    applySystemAccent(currentAccent, runtime.root, runtime.window);
  const handleFocus = () => {
    if (runtime.isNative()) void queryAndApply(runtime);
  };

  media?.addEventListener("change", handleSchemeChange);
  runtime.window.addEventListener("focus", handleFocus);

  let unlisten: UnlistenFn | undefined;
  if (runtime.isNative()) {
    const listenerStarted = runtime
      .listenNative((value) => {
        const accent = parseSystemAccent(value);
        if (accent) applySystemAccent(accent, runtime.root, runtime.window);
      })
      .then((stopListening) => {
        unlisten = stopListening;
      })
      .catch(() => {
        // A native query still provides the current value if event delivery is
        // unavailable on an older or restricted host.
      });
    await queryAndApply(runtime);
    await listenerStarted;
  }

  return () => {
    unlisten?.();
    media?.removeEventListener("change", handleSchemeChange);
    runtime.window.removeEventListener("focus", handleFocus);
  };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

export async function initializeSystemAccent(
  fallbackDeadline = 250,
): Promise<void> {
  if (!startPromise) {
    const generation = ++syncGeneration;
    const runtime = defaultRuntime();
    const started = startRuntime(runtime).then((cleanup) => {
      if (generation === syncGeneration) runtimeCleanup = cleanup;
      else cleanup();
    });
    startPromise = Promise.race([started, wait(fallbackDeadline)]);
  }
  await startPromise;
}

export function stopSystemAccentSync(): void {
  syncGeneration += 1;
  runtimeCleanup?.();
  runtimeCleanup = undefined;
  startPromise = undefined;
}

export const systemAccentTesting = {
  startRuntime,
  reset(): void {
    stopSystemAccentSync();
    currentAccent = NEUTRAL_SYSTEM_ACCENT;
    appliedAccent = undefined;
    listeners.clear();
  },
};
