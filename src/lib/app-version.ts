import packageMetadata from "../../package.json";

export const APP_VERSION = packageMetadata.version;

export function normalizeBuildRevision(value: unknown): string {
  if (typeof value !== "string") return "local";
  const revision = value.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(revision) ? revision : "local";
}

export const BUILD_REVISION = normalizeBuildRevision(
  import.meta.env.VITE_BUILD_REVISION,
);
