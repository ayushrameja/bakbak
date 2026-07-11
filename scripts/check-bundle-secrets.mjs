import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const roots = ["dist", "src-tauri/target/release/bundle"].filter(existsSync);
const readableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".txt",
]);
const forbiddenNames = ["LIVEKIT_API_SECRET", "SUPABASE_SERVICE_ROLE_KEY"];
const configuredSecrets = [
  process.env.LIVEKIT_API_SECRET,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
].filter((value) => value && value.length >= 12);

const findings = [];

function scan(path) {
  const metadata = statSync(path);
  if (metadata.isDirectory()) {
    for (const entry of readdirSync(path)) scan(join(path, entry));
    return;
  }

  if (!readableExtensions.has(extname(path)) || metadata.size > 10_000_000)
    return;
  const contents = readFileSync(path, "utf8");
  for (const name of forbiddenNames) {
    if (contents.includes(name))
      findings.push(`${path}: contains forbidden variable name ${name}`);
  }
  for (const secret of configuredSecrets) {
    if (contents.includes(secret))
      findings.push(`${path}: contains a configured secret value`);
  }
}

for (const root of roots) scan(root);

if (findings.length > 0) {
  console.error("Secret scan failed:\n" + findings.join("\n"));
  process.exit(1);
}

console.log(
  roots.length === 0
    ? "Secret scan skipped: no compiled bundle exists yet."
    : `Secret scan passed for ${roots.join(", ")}.`,
);
