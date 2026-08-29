import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const forbiddenNames = ["LIVEKIT_API_SECRET", "SUPABASE_SERVICE_ROLE_KEY"];
const forbiddenPrefixes = ["sb_secret_"];
const SCAN_CHUNK_BYTES = 1024 * 1024;

export function findCompiledBundleRoots(cwd = process.cwd()) {
  const roots = [];
  const add = (path) => {
    if (existsSync(path) && !roots.includes(path)) roots.push(path);
  };

  add(join(cwd, "dist"));
  add(join(cwd, "electron-dist"));
  add(join(cwd, "release"));
  add(join(cwd, "release-tauri"));
  add(join(cwd, "src-tauri", "target", "release", "bundle"));
  for (const target of ["aarch64-apple-darwin", "x86_64-pc-windows-msvc"]) {
    add(join(cwd, "src-tauri", "target", target, "release", "bundle"));
    add(
      join(
        cwd,
        "src-tauri",
        "target",
        target,
        "release",
        target === "x86_64-pc-windows-msvc" ? "bakbak.exe" : "bakbak",
      ),
    );
    add(
      join(
        cwd,
        "src-tauri",
        "binaries",
        `bakbak-screen-share-helper-${target}${
          target === "x86_64-pc-windows-msvc" ? ".exe" : ""
        }`,
      ),
    );
  }
  add(
    join(
      cwd,
      "native",
      "screen-share-helper",
      "target",
      "release",
      "bakbak-screen-share-helper",
    ),
  );
  add(
    join(
      cwd,
      "native",
      "screen-share-helper",
      "target",
      "release",
      "bakbak-screen-share-helper.exe",
    ),
  );
  return roots;
}

export function inspectCompiledBundles({
  cwd = process.cwd(),
  environment = process.env,
} = {}) {
  const roots = findCompiledBundleRoots(cwd);
  const configuredSecrets = [
    environment.LIVEKIT_API_SECRET,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((value) => value && value.length >= 12);
  const findings = [];

  const scan = (path) => {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) return;
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(path)) scan(join(path, entry));
      return;
    }

    if (!metadata.isFile() || metadata.size === 0) return;
    const matches = scanFile(path, [
      ...forbiddenNames,
      ...forbiddenPrefixes,
      ...configuredSecrets,
    ]);
    for (const name of forbiddenNames) {
      if (matches.has(name)) {
        findings.push(
          `${relative(cwd, path)}: contains forbidden variable name ${name}`,
        );
      }
    }
    for (const prefix of forbiddenPrefixes) {
      if (matches.has(prefix)) {
        findings.push(
          `${relative(cwd, path)}: contains forbidden secret prefix ${prefix}`,
        );
      }
    }
    for (const secret of configuredSecrets) {
      if (matches.has(secret)) {
        findings.push(
          `${relative(cwd, path)}: contains a configured secret value`,
        );
      }
    }
  };

  for (const root of roots) scan(root);
  return {
    roots: roots.map((root) => relative(cwd, root)),
    findings,
  };
}

function scanFile(path, needles) {
  const encoded = needles.map((value) => ({
    value,
    bytes: Buffer.from(value),
  }));
  const remaining = new Set(needles);
  const overlap = Math.max(0, ...encoded.map(({ bytes }) => bytes.length - 1));
  const buffer = Buffer.allocUnsafe(SCAN_CHUNK_BYTES);
  let carry = Buffer.alloc(0);
  const handle = openSync(path, "r");
  try {
    for (;;) {
      const bytesRead = readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      const searchable = carry.length
        ? Buffer.concat([carry, chunk], carry.length + chunk.length)
        : chunk;
      for (const needle of encoded) {
        if (
          remaining.has(needle.value) &&
          searchable.indexOf(needle.bytes) !== -1
        ) {
          remaining.delete(needle.value);
        }
      }
      if (remaining.size === 0) break;
      carry = overlap
        ? Buffer.from(
            searchable.subarray(Math.max(0, searchable.length - overlap)),
          )
        : Buffer.alloc(0);
    }
  } finally {
    closeSync(handle);
  }
  return new Set(needles.filter((needle) => !remaining.has(needle)));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = inspectCompiledBundles();
  if (result.findings.length > 0) {
    console.error(`Secret scan failed:\n${result.findings.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(
      result.roots.length === 0
        ? "Secret scan skipped: no compiled bundle exists yet."
        : `Secret scan passed for ${result.roots.join(", ")}.`,
    );
  }
}
