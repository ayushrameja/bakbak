const stableSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function isStableSemver(version) {
  return typeof version === "string" && stableSemverPattern.test(version);
}

export function withPackageVersion(packageMetadata, version) {
  if (!isStableSemver(version)) {
    throw new Error(`Bakbak version is not stable SemVer: ${version}`);
  }
  return { ...packageMetadata, version };
}

export function packageVersionFromCargo(source) {
  const section = cargoSection(source, "[package]");
  return section.match(/^version = "([^"]+)"$/m)?.[1] ?? null;
}

export function withCargoPackageVersion(source, version) {
  assertVersion(version);
  return replaceCargoSectionVersion(source, "[package]", version);
}

export function lockedBakbakVersion(source) {
  const marker = '[[package]]\nname = "bakbak"';
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const end = source.indexOf("\n[[package]]", start + marker.length);
  const section = source.slice(start, end < 0 ? source.length : end);
  return section.match(/^version = "([^"]+)"$/m)?.[1] ?? null;
}

export function withLockedBakbakVersion(source, version) {
  assertVersion(version);
  const marker = '[[package]]\nname = "bakbak"';
  const start = source.indexOf(marker);
  if (start < 0)
    throw new Error("Bakbak is missing from the Tauri Cargo lockfile.");
  const end = source.indexOf("\n[[package]]", start + marker.length);
  const sectionEnd = end < 0 ? source.length : end;
  const section = source.slice(start, sectionEnd);
  const updated = section.replace(
    /^version = "[^"]+"$/m,
    `version = "${version}"`,
  );
  if (updated === section) {
    throw new Error("Bakbak has no version in the Tauri Cargo lockfile.");
  }
  return `${source.slice(0, start)}${updated}${source.slice(sectionEnd)}`;
}

function replaceCargoSectionVersion(source, marker, version) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Cargo metadata is missing ${marker}.`);
  const nextSection = source.indexOf("\n[", start + marker.length);
  const end = nextSection < 0 ? source.length : nextSection;
  const section = source.slice(start, end);
  const updated = section.replace(
    /^version = "[^"]+"$/m,
    `version = "${version}"`,
  );
  if (updated === section) throw new Error(`${marker} has no version.`);
  return `${source.slice(0, start)}${updated}${source.slice(end)}`;
}

function cargoSection(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const nextSection = source.indexOf("\n[", start + marker.length);
  return source.slice(start, nextSection < 0 ? source.length : nextSection);
}

function assertVersion(version) {
  if (!isStableSemver(version)) {
    throw new Error(`Bakbak version is not stable SemVer: ${version}`);
  }
}
