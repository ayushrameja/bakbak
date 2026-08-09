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
