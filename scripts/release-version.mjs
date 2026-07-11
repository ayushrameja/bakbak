import { pathToFileURL } from "node:url";

const SEMVER_PATTERN = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseVersion(value) {
  const match = SEMVER_PATTERN.exec(value ?? "");
  if (!match)
    throw new Error(`Expected a stable SemVer version, received: ${value}`);

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function incrementVersion(version, bump) {
  if (bump === "major") {
    return { major: version.major + 1, minor: 0, patch: 0 };
  }
  if (bump === "minor") {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }
  return { ...version, patch: version.patch + 1 };
}

export function resolveRelease({
  currentTag = "",
  fallbackVersion,
  labels = [],
  requestedBump = "",
}) {
  const normalizedLabels = new Set(
    labels.map((label) => label.trim()).filter(Boolean),
  );
  const skip = !requestedBump && normalizedLabels.has("release:skip");
  const fallback = parseVersion(fallbackVersion);
  const current = currentTag ? parseVersion(currentTag) : null;

  let bump = requestedBump;
  if (!bump) {
    bump = normalizedLabels.has("release:major")
      ? "major"
      : normalizedLabels.has("release:minor")
        ? "minor"
        : "patch";
  }
  if (!new Set(["patch", "minor", "major"]).has(bump)) {
    throw new Error(`Unsupported release bump: ${bump}`);
  }

  const next =
    !current || compareVersions(fallback, current) > 0
      ? fallback
      : incrementVersion(current, bump);
  const version = formatVersion(next);

  return { bump, skip, tag: `v${version}`, version };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const release = resolveRelease({
    currentTag: argumentValue("--current"),
    fallbackVersion: argumentValue("--fallback"),
    labels: argumentValue("--labels").split(","),
    requestedBump: argumentValue("--bump"),
  });

  process.stdout.write(
    `version=${release.version}\ntag=${release.tag}\nskip=${release.skip}\nbump=${release.bump}\n`,
  );
}
