const cargoLockPackagePattern =
  /\[\[package\]\]\r?\nname = "bakbak"\r?\nversion = "([^"]+)"/;
const cargoLockPackageReplacementPattern =
  /(\[\[package\]\]\r?\nname = "bakbak"\r?\nversion = ")[^"]+(")/;

export function findCargoLockVersion(cargoLock) {
  return cargoLockPackagePattern.exec(cargoLock)?.[1] ?? null;
}

export function replaceCargoLockVersion(cargoLock, version) {
  return cargoLock.replace(
    cargoLockPackageReplacementPattern,
    `$1${version}$2`,
  );
}
