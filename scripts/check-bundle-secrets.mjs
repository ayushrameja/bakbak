import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const readableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".txt",
]);
const forbiddenNames = ["LIVEKIT_API_SECRET", "SUPABASE_SERVICE_ROLE_KEY"];

export function findCompiledBundleRoots(cwd = process.cwd()) {
  const roots = [];
  const add = (path) => {
    if (existsSync(path) && !roots.includes(path)) roots.push(path);
  };

  add(join(cwd, "dist"));
  const targetRoot = join(cwd, "src-tauri", "target");
  add(join(targetRoot, "release", "bundle"));
  if (existsSync(targetRoot)) {
    for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      add(join(targetRoot, entry.name, "release", "bundle"));
    }
  }
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
    const metadata = statSync(path);
    if (metadata.isDirectory()) {
      for (const entry of readdirSync(path)) scan(join(path, entry));
      return;
    }

    if (!readableExtensions.has(extname(path)) || metadata.size > 10_000_000)
      return;
    const contents = readFileSync(path, "utf8");
    for (const name of forbiddenNames) {
      if (contents.includes(name)) {
        findings.push(
          `${relative(cwd, path)}: contains forbidden variable name ${name}`,
        );
      }
    }
    for (const secret of configuredSecrets) {
      if (contents.includes(secret)) {
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
