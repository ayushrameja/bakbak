import { chmod, copyFile, mkdir, rm, stat } from "node:fs/promises";

const binaryName = `bakbak-screen-share-helper${
  process.platform === "win32" ? ".exe" : ""
}`;
const source = new URL(
  `../native/screen-share-helper/target/release/${binaryName}`,
  import.meta.url,
);
const stageDirectory = new URL("../build/native/", import.meta.url);
const destination = new URL(binaryName, stageDirectory);

const sourceStat = await stat(source).catch(() => null);
if (!sourceStat?.isFile()) {
  throw new Error(
    `Release screen-share helper is missing; run the locked native release build first (${binaryName}).`,
  );
}

await rm(stageDirectory, { recursive: true, force: true });
await mkdir(stageDirectory, { recursive: true });
await copyFile(source, destination);
if (process.platform !== "win32") await chmod(destination, 0o755);
