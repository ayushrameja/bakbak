import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";

const profile = process.argv[2] === "debug" ? "debug" : "release";
const extension = process.platform === "win32" ? ".exe" : "";
const binaryName = `bakbak-screen-share-helper${extension}`;
const targetTriple = execFileSync("rustc", ["--print", "host-tuple"], {
  encoding: "utf8",
}).trim();

if (!/^[a-zA-Z0-9_.-]+$/.test(targetTriple)) {
  throw new Error("Rust returned an invalid host target triple.");
}

const source = new URL(
  `../native/screen-share-helper/target/${profile}/${binaryName}`,
  import.meta.url,
);
const destinationDirectory = new URL("../src-tauri/binaries/", import.meta.url);
const destination = new URL(
  `bakbak-screen-share-helper-${targetTriple}${extension}`,
  destinationDirectory,
);
const sourceStat = await stat(source).catch(() => null);

if (!sourceStat?.isFile()) {
  throw new Error(
    `The ${profile} screen-share helper is missing. Build the locked native helper first.`,
  );
}

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
if (process.platform !== "win32") await chmod(destination, 0o755);
