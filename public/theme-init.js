(() => {
  const v2Key = "bakbak.appearancePreferences.v2";
  const v1Key = "bakbak.appearancePreferences.v1";
  const defaults = { theme: "system", accent: "coral", intensity: 100 };
  const hues = { coral: 12, purple: 276, red: 355, yellow: 44 };
  let preferences = defaults;
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(v2Key) ?? "null");
    const themeValid = ["system", "light", "dark"].includes(stored?.theme);
    const accentValid = ["coral", "purple", "red", "yellow"].includes(
      stored?.accent,
    );
    const intensityValid =
      Number.isInteger(stored?.intensity) &&
      stored.intensity >= 25 &&
      stored.intensity <= 100 &&
      stored.intensity % 5 === 0;
    if (themeValid && accentValid && intensityValid) {
      preferences = stored;
    } else {
      const legacy = JSON.parse(
        globalThis.localStorage.getItem(v1Key) ?? "null",
      );
      if (["system", "light", "dark"].includes(legacy?.theme)) {
        preferences = { ...defaults, theme: legacy.theme };
      }
    }
  } catch {
    // Corrupt or inaccessible preferences must not delay first paint.
  }

  const resolved =
    preferences.theme === "system"
      ? globalThis.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preferences.theme;
  const root = globalThis.document.documentElement;
  const strength = preferences.intensity / 100;
  const hue = hues[preferences.accent];
  const saturation = Math.round(35 + strength * 48);
  const yellow = preferences.accent === "yellow";
  const lightness = yellow
    ? resolved === "light"
      ? 38
      : 63
    : resolved === "light"
      ? 44
      : 63;
  const brightLightness = yellow
    ? resolved === "light"
      ? 33
      : 70
    : resolved === "light"
      ? 39
      : 69;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preferences.theme;
  root.dataset.accent = preferences.accent;
  root.dataset.accentIntensity = String(preferences.intensity);
  root.style.colorScheme = resolved;
  root.style.setProperty(
    "--accent",
    `hsl(${hue} ${saturation}% ${lightness}%)`,
  );
  root.style.setProperty(
    "--accent-bright",
    `hsl(${hue} ${Math.min(92, saturation + 6)}% ${brightLightness}%)`,
  );
  root.style.setProperty(
    "--accent-soft",
    `hsl(${hue} ${saturation}% ${lightness}% / ${(0.07 + strength * 0.09).toFixed(3)})`,
  );
  root.style.setProperty(
    "--accent-border",
    `hsl(${hue} ${saturation}% ${lightness}% / ${(0.25 + strength * 0.3).toFixed(3)})`,
  );
  root.style.setProperty(
    "--canvas-glow",
    `hsl(${hue} ${saturation}% ${lightness}% / ${(0.035 + strength * 0.055).toFixed(3)})`,
  );
  root.style.setProperty("--on-accent", yellow ? "#211e1b" : "#fffaf2");
  const themeColor = globalThis.document.querySelector(
    'meta[name="theme-color"]',
  );
  themeColor?.setAttribute(
    "content",
    resolved === "dark" ? "#211e1b" : "#f3ede3",
  );
})();
