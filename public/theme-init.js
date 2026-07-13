(() => {
  const preferenceKey = "bakbak.appearancePreferences.v1";
  let preference = "system";
  try {
    const stored = JSON.parse(
      globalThis.localStorage.getItem(preferenceKey) ?? "null",
    );
    if (
      stored?.theme === "system" ||
      stored?.theme === "light" ||
      stored?.theme === "dark"
    ) {
      preference = stored.theme;
    }
  } catch {
    // A corrupt or inaccessible preference must not delay first paint.
  }

  const resolved =
    preference === "system"
      ? globalThis.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  globalThis.document.documentElement.dataset.theme = resolved;
  globalThis.document.documentElement.dataset.themePreference = preference;
  globalThis.document.documentElement.style.colorScheme = resolved;
  const themeColor = globalThis.document.querySelector(
    'meta[name="theme-color"]',
  );
  if (themeColor) {
    themeColor.setAttribute(
      "content",
      resolved === "dark" ? "#211e1b" : "#f3ede3",
    );
  }
})();
