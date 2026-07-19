(() => {
  const v6Key = "bakbak.appearancePreferences.v6";
  const defaults = {
    theme: "system",
    accent: "purple",
    intensity: 100,
    surfaceStyle: "flat",
    visualPreset: "standard",
  };
  const hues = { coral: 12, purple: 276, red: 355, yellow: 44 };
  let preferences = defaults;
  let migrated = true;
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(v6Key) ?? "null");
    const themeValid = ["system", "light", "dark"].includes(stored?.theme);
    const accentValid = ["coral", "purple", "red", "yellow"].includes(
      stored?.accent,
    );
    const intensityValid =
      Number.isInteger(stored?.intensity) &&
      stored.intensity >= 25 &&
      stored.intensity <= 100 &&
      stored.intensity % 5 === 0;
    const surfaceValid = ["warm", "flat"].includes(stored?.surfaceStyle);
    const presetValid = ["signature", "standard", "signal-red"].includes(
      stored?.visualPreset,
    );
    if (
      themeValid &&
      accentValid &&
      intensityValid &&
      surfaceValid &&
      presetValid
    ) {
      preferences = stored;
      migrated = false;
    }
  } catch {
    // Corrupt or inaccessible preferences must not delay first paint.
  }
  if (migrated) {
    try {
      globalThis.localStorage.setItem(v6Key, JSON.stringify(preferences));
    } catch {
      // Read-only storage must not delay first paint.
    }
  }

  const preferredTheme =
    preferences.theme === "system"
      ? globalThis.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preferences.theme;
  const signalRed = preferences.visualPreset === "signal-red";
  const signature = preferences.visualPreset === "signature";
  const fixedPreset = signalRed || signature;
  const resolved = fixedPreset ? "dark" : preferredTheme;
  const root = globalThis.document.documentElement;
  const strength = preferences.intensity / 100;
  const hue = hues[signalRed ? "red" : preferences.accent];
  const saturation = Math.round(35 + strength * 48);
  const yellow = !signalRed && preferences.accent === "yellow";
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
  root.dataset.accent = signalRed
    ? "red"
    : signature
      ? "coral"
      : preferences.accent;
  root.dataset.accentIntensity = String(
    fixedPreset ? 100 : preferences.intensity,
  );
  root.dataset.surfaceStyle = signalRed
    ? "flat"
    : signature
      ? "warm"
      : preferences.surfaceStyle;
  root.dataset.visualPreset = preferences.visualPreset;
  root.style.colorScheme = resolved;
  root.style.setProperty(
    "--accent",
    signalRed
      ? "#e5062f"
      : signature
        ? "#8b4a2f"
        : `hsl(${hue} ${saturation}% ${lightness}%)`,
  );
  root.style.setProperty(
    "--accent-bright",
    signalRed
      ? "#ff2648"
      : signature
        ? "#d1b06e"
        : `hsl(${hue} ${Math.min(92, saturation + 6)}% ${brightLightness}%)`,
  );
  root.style.setProperty(
    "--accent-soft",
    signalRed
      ? "rgb(229 6 47 / 0.14)"
      : signature
        ? "rgb(139 74 47 / 0.18)"
        : `hsl(${hue} ${saturation}% ${lightness}% / ${(0.07 + strength * 0.09).toFixed(3)})`,
  );
  root.style.setProperty(
    "--accent-border",
    signalRed
      ? "rgb(229 6 47 / 0.58)"
      : signature
        ? "rgb(209 176 110 / 0.5)"
        : `hsl(${hue} ${saturation}% ${lightness}% / ${(0.25 + strength * 0.3).toFixed(3)})`,
  );
  root.style.setProperty(
    "--canvas-glow",
    signalRed
      ? "rgb(229 6 47 / 0.09)"
      : signature
        ? "rgb(209 176 110 / 0.08)"
        : `hsl(${hue} ${saturation}% ${lightness}% / ${(0.035 + strength * 0.055).toFixed(3)})`,
  );
  root.style.setProperty(
    "--on-accent",
    signalRed
      ? "#f4f2ef"
      : signature
        ? "#fff8ef"
        : yellow
          ? "#211e1b"
          : "#fffaf2",
  );
  const themeColor = globalThis.document.querySelector(
    'meta[name="theme-color"]',
  );
  themeColor?.setAttribute(
    "content",
    fixedPreset
      ? signalRed
        ? "#050505"
        : "#100d0b"
      : preferences.surfaceStyle === "flat"
        ? resolved === "dark"
          ? "#090909"
          : "#ffffff"
        : resolved === "dark"
          ? "#211e1b"
          : "#f3ede3",
  );
})();
