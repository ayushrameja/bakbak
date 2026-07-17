(() => {
  const v4Key = "bakbak.appearancePreferences.v4";
  const v3Key = "bakbak.appearancePreferences.v3";
  const v2Key = "bakbak.appearancePreferences.v2";
  const v1Key = "bakbak.appearancePreferences.v1";
  const defaults = {
    theme: "system",
    accent: "coral",
    intensity: 100,
    surfaceStyle: "warm",
    visualPreset: "standard",
  };
  const hues = { coral: 12, purple: 276, red: 355, yellow: 44 };
  let preferences = defaults;
  try {
    const stored = JSON.parse(globalThis.localStorage.getItem(v4Key) ?? "null");
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
    const presetValid = ["standard", "signal-red"].includes(
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
    } else {
      const v3 = JSON.parse(globalThis.localStorage.getItem(v3Key) ?? "null");
      const v3Valid =
        ["system", "light", "dark"].includes(v3?.theme) &&
        ["coral", "purple", "red", "yellow"].includes(v3?.accent) &&
        Number.isInteger(v3?.intensity) &&
        v3.intensity >= 25 &&
        v3.intensity <= 100 &&
        v3.intensity % 5 === 0 &&
        ["warm", "flat"].includes(v3?.surfaceStyle);
      if (v3Valid) {
        preferences = { ...v3, visualPreset: "standard" };
      } else {
        const v2 = JSON.parse(globalThis.localStorage.getItem(v2Key) ?? "null");
        const v2Valid =
          ["system", "light", "dark"].includes(v2?.theme) &&
          ["coral", "purple", "red", "yellow"].includes(v2?.accent) &&
          Number.isInteger(v2?.intensity) &&
          v2.intensity >= 25 &&
          v2.intensity <= 100 &&
          v2.intensity % 5 === 0;
        if (v2Valid) {
          preferences = {
            ...v2,
            surfaceStyle: "warm",
            visualPreset: "standard",
          };
        } else {
          const legacy = JSON.parse(
            globalThis.localStorage.getItem(v1Key) ?? "null",
          );
          if (["system", "light", "dark"].includes(legacy?.theme)) {
            preferences = { ...defaults, theme: legacy.theme };
          }
        }
      }
    }
  } catch {
    // Corrupt or inaccessible preferences must not delay first paint.
  }

  const preferredTheme =
    preferences.theme === "system"
      ? globalThis.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preferences.theme;
  const signalRed = preferences.visualPreset === "signal-red";
  const resolved = signalRed ? "dark" : preferredTheme;
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
  root.dataset.accent = signalRed ? "red" : preferences.accent;
  root.dataset.accentIntensity = String(
    signalRed ? 100 : preferences.intensity,
  );
  root.dataset.surfaceStyle = signalRed ? "flat" : preferences.surfaceStyle;
  root.dataset.visualPreset = preferences.visualPreset;
  root.style.colorScheme = resolved;
  root.style.setProperty(
    "--accent",
    signalRed ? "#e5062f" : `hsl(${hue} ${saturation}% ${lightness}%)`,
  );
  root.style.setProperty(
    "--accent-bright",
    signalRed
      ? "#ff2648"
      : `hsl(${hue} ${Math.min(92, saturation + 6)}% ${brightLightness}%)`,
  );
  root.style.setProperty(
    "--accent-soft",
    signalRed
      ? "rgb(229 6 47 / 0.14)"
      : `hsl(${hue} ${saturation}% ${lightness}% / ${(0.07 + strength * 0.09).toFixed(3)})`,
  );
  root.style.setProperty(
    "--accent-border",
    signalRed
      ? "rgb(229 6 47 / 0.58)"
      : `hsl(${hue} ${saturation}% ${lightness}% / ${(0.25 + strength * 0.3).toFixed(3)})`,
  );
  root.style.setProperty(
    "--canvas-glow",
    signalRed
      ? "rgb(229 6 47 / 0.09)"
      : `hsl(${hue} ${saturation}% ${lightness}% / ${(0.035 + strength * 0.055).toFixed(3)})`,
  );
  root.style.setProperty(
    "--on-accent",
    signalRed ? "#f4f2ef" : yellow ? "#211e1b" : "#fffaf2",
  );
  const themeColor = globalThis.document.querySelector(
    'meta[name="theme-color"]',
  );
  themeColor?.setAttribute(
    "content",
    signalRed
      ? "#050505"
      : preferences.surfaceStyle === "flat"
        ? resolved === "dark"
          ? "#090909"
          : "#ffffff"
        : resolved === "dark"
          ? "#211e1b"
          : "#f3ede3",
  );
})();
