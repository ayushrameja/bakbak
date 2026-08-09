import { pathToFileURL } from "node:url";

const REQUIRED_ENTRIES = [
  "Bakbak.app/Contents/Info.plist",
  "Bakbak.app/Contents/MacOS/Bakbak",
];

function archivePathSegments(entry) {
  return entry.replace(/\/+$/, "").split("/");
}

export function verifyLegacyMacArchiveEntries(entries) {
  const normalizedEntries = entries
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (normalizedEntries.length === 0) {
    throw new Error("Legacy macOS updater archive is empty.");
  }

  for (const entry of normalizedEntries) {
    const segments = archivePathSegments(entry);
    if (entry.startsWith("/") || segments.includes("..")) {
      throw new Error(`Legacy macOS updater archive has unsafe path ${entry}.`);
    }
    if (segments[0] !== "Bakbak.app") {
      throw new Error(
        `Legacy macOS updater archive has unexpected root entry ${entry}.`,
      );
    }
    const metadataSegment = segments.find(
      (segment) => segment === "__MACOSX" || segment.startsWith("._"),
    );
    if (metadataSegment) {
      throw new Error(
        `Legacy macOS updater archive contains forbidden AppleDouble metadata ${entry}.`,
      );
    }
  }

  const entrySet = new Set(normalizedEntries);
  for (const requiredEntry of REQUIRED_ENTRIES) {
    if (!entrySet.has(requiredEntry)) {
      throw new Error(
        `Legacy macOS updater archive is missing ${requiredEntry}.`,
      );
    }
  }

  return { entryCount: normalizedEntries.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const result = verifyLegacyMacArchiveEntries(input.split("\n"));
  process.stdout.write(
    `Legacy macOS updater archive contains ${result.entryCount} clean Bakbak.app entries.\n`,
  );
}
