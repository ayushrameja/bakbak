import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const stylesUrl = new URL("../src/styles.css", import.meta.url);
const logoUrl = new URL("../public/bakbak.svg", import.meta.url);
const fontUrl = new URL(
  "../public/fonts/roundo/Roundo-Variable.woff2",
  import.meta.url,
);
const licenseUrl = new URL("../third_party/roundo/OFL.txt", import.meta.url);
const appUrl = new URL("../src/app/App.tsx", import.meta.url);
const settingsUrl = new URL(
  "../src/features/settings/SettingsPage.tsx",
  import.meta.url,
);

const [styles, logo, app, settings, font, license] = await Promise.all([
  readFile(stylesUrl, "utf8"),
  readFile(logoUrl, "utf8"),
  readFile(appUrl, "utf8"),
  readFile(settingsUrl, "utf8"),
  readFile(fontUrl),
  readFile(licenseUrl, "utf8"),
]);

function expandHex(value) {
  const hex = value.slice(1).toLowerCase();
  return hex.length === 3 || hex.length === 4
    ? [...hex].map((character) => character.repeat(2)).join("")
    : hex;
}

function assertGrayscale(source, label) {
  for (const match of source.matchAll(/#[\da-f]{3,8}\b/gi)) {
    const hex = expandHex(match[0]);
    assert.equal(
      hex.slice(0, 2),
      hex.slice(2, 4),
      `${label} contains chromatic colour ${match[0]}`,
    );
    assert.equal(
      hex.slice(2, 4),
      hex.slice(4, 6),
      `${label} contains chromatic colour ${match[0]}`,
    );
  }

  for (const match of source.matchAll(/rgba?\(([^)]*)\)/gi)) {
    const channels = match[1]
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    assert.equal(channels?.length, 3, `${label} has an unreadable ${match[0]}`);
    assert.equal(
      channels[0],
      channels[1],
      `${label} contains chromatic colour ${match[0]}`,
    );
    assert.equal(
      channels[1],
      channels[2],
      `${label} contains chromatic colour ${match[0]}`,
    );
  }
}

const semanticTokenValues = {
  "semantic-positive": ["#23a55a", "#18733e"],
  "semantic-danger": ["#da373c", "#b9252b"],
  "semantic-selected": ["#5865f2", "#3d49b8"],
  "semantic-warning": ["#f0b232", "#8a5a00"],
  "icon-primary": ["#f2f3f5", "#1e1f22"],
  "icon-secondary": ["#b5bac1", "#4e5058"],
};

function contrastRatio(left, right) {
  const luminance = (value) => {
    const channels = value
      .slice(1)
      .match(/../g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const leftLuminance = luminance(left);
  const rightLuminance = luminance(right);
  return (
    (Math.max(leftLuminance, rightLuminance) + 0.05) /
    (Math.min(leftLuminance, rightLuminance) + 0.05)
  );
}

test("ordinary chrome and the in-app logo remain monochrome", () => {
  const semanticNames = Object.keys(semanticTokenValues).join("|");
  const ordinaryStyles = styles.replace(
    new RegExp(`--(?:${semanticNames}):\\s*#[\\da-f]{3,8};`, "gi"),
    "",
  );
  assertGrayscale(ordinaryStyles, "src/styles.css ordinary chrome");
  assertGrayscale(logo, "public/bakbak.svg");
  assert.doesNotMatch(styles, /\b(?:hsl|hsla|hwb|lab|lch|oklch)\(/i);

  for (const match of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/avatar|cover|emoji|participant-video|screen-share/i.test(match[1])) {
      assert.doesNotMatch(
        match[2],
        /(^|[^-])filter\s*:/,
        `${match[1].trim()} must preserve user/live media colour`,
      );
    }
  }
});

test("approved semantic colors are system-adaptive and accessible", () => {
  for (const [name, expectedValues] of Object.entries(semanticTokenValues)) {
    const actualValues = [
      ...styles.matchAll(new RegExp(`--${name}:\\s*(#[\\da-f]{6});`, "gi")),
    ].map((match) => match[1].toLowerCase());
    assert.deepEqual(actualValues, expectedValues, `${name} token drifted`);
  }

  const backgrounds = ["#0e0e0e", "#ffffff"];
  for (const name of [
    "semantic-positive",
    "semantic-warning",
    "icon-primary",
    "icon-secondary",
  ]) {
    semanticTokenValues[name].forEach((value, scheme) =>
      assert.ok(
        contrastRatio(value, backgrounds[scheme]) >= 4.5,
        `${name} lacks text contrast in scheme ${scheme}`,
      ),
    );
  }
  for (const name of ["semantic-danger", "semantic-selected"]) {
    semanticTokenValues[name].forEach((value, scheme) =>
      assert.ok(
        contrastRatio(value, "#ffffff") >= 4.5,
        `${name} lacks on-fill contrast in scheme ${scheme}`,
      ),
    );
  }

  assert.match(
    styles,
    /\.voice-control-dock \.voice-control-dock__leave,[\s\S]*?color:\s*var\(--on-semantic-fill\)[\s\S]*?background:\s*var\(--semantic-danger\)/,
  );
  assert.match(
    styles,
    /\.soundboard-stop-footer button\s*{[\s\S]*?color:\s*var\(--on-semantic-fill\)[\s\S]*?background:\s*var\(--semantic-danger\)/,
  );
});

test("Roundo is local, pinned, licensed, and limited to supported weights", () => {
  assert.match(
    styles,
    /@font-face\s*{[^}]*font-family:\s*"Roundo";[^}]*font-weight:\s*200 700;[^}]*font-display:\s*swap;/s,
  );
  assert.equal(styles.match(/@font-face/g)?.length, 1);
  assert.match(styles, /font-family:\s*"Roundo", ui-sans-serif, sans-serif;/);
  assert.equal(
    createHash("sha256").update(font).digest("hex"),
    "74481965a428478803e36f6aaf21d163c36c5c8fc2cb27029dfbf1f9fb6f5a65",
  );
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);

  const productStyles = styles.replace(/@font-face\s*{[^}]*}/s, "");
  for (const match of productStyles.matchAll(/font-weight:\s*(\d+)/g)) {
    assert.ok(
      [500, 600, 700].includes(Number(match[1])),
      `unapproved product typography weight ${match[1]}`,
    );
  }
  for (const match of styles.matchAll(/font:\s*(\d+)\b/g)) {
    assert.ok(Number(match[1]) <= 700, `unsupported font weight ${match[1]}`);
  }
  for (const match of styles.matchAll(/font-size:\s*(\d+)px/g)) {
    assert.ok(Number(match[1]) >= 11, `cramped text size ${match[1]}px`);
  }
  assert.match(styles, /--font-chat:\s*15px;/);
  assert.match(
    styles,
    /\.message__body p\s*{[^}]*font-size:\s*var\(--font-chat\);[^}]*font-weight:\s*500;/s,
  );
  assert.match(
    styles,
    /\.composer input\s*{[^}]*font-size:\s*var\(--font-chat\);[^}]*font-weight:\s*500;/s,
  );
});

test("legacy themes and appearance state stay removed", async () => {
  const productionAppearance = `${styles}\n${app}\n${settings}`;
  assert.doesNotMatch(
    productionAppearance,
    /data-theme|data-surface-style|data-visual-preset|appearancePreferences|themePreference|visualPreset|accentIntensity|SignalRed|signal-red|signature-|Cormorant Garamond|League Gothic|IBM Plex Mono|@fontsource/i,
  );
  assert.match(settings, /<strong>Glass<\/strong>/);
  assert.match(settings, /<strong>Follows system<\/strong>/);
  assert.match(settings, /<strong>Roundo<\/strong>/);

  for (const path of [
    "../public/theme-init.js",
    "../public/signal-noise.svg",
    "../public/signature-leather.svg",
    "../public/signature-textile.svg",
  ]) {
    await assert.rejects(access(new URL(path, import.meta.url)), {
      code: "ENOENT",
    });
  }
});
