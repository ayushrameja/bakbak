import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installer = await readFile("build/installer.nsh", "utf8");
const electronMain = await readFile("electron/main.ts", "utf8");
const viteConfig = await readFile("vite.config.ts", "utf8");

test("desktop development uses one explicit IPv4 loopback origin", () => {
  assert.match(
    packageJson.scripts["desktop:dev"],
    /wait-on tcp:127\.0\.0\.1:1420 && electron \./,
  );
  assert.match(viteConfig, /host: "127\.0\.0\.1"/);
  assert.match(electronMain, /DEVELOPMENT_URL = "http:\/\/127\.0\.0\.1:1420"/);
});

test("desktop packaging keeps the supported identities and architectures", () => {
  assert.equal(packageJson.build.appId, "com.bakbak.desktop");
  assert.equal(packageJson.build.executableName, "bakbak");
  assert.equal(packageJson.build.mac.executableName, "Bakbak");
  assert.equal(packageJson.build.win.executableName, "bakbak");
  assert.deepEqual(packageJson.build.mac.target, [
    { target: "dmg", arch: ["arm64"] },
    { target: "zip", arch: ["arm64"] },
  ]);
  assert.deepEqual(packageJson.build.win.target, [
    { target: "nsis", arch: ["x64"] },
  ]);
});

test("desktop packaging builds and bundles the native screen-share helper", () => {
  assert.match(packageJson.scripts["desktop:prepare"], /pnpm native:build/);
  assert.match(
    packageJson.scripts["native:build"],
    /cargo build --release --locked --manifest-path native\/screen-share-helper\/Cargo\.toml/,
  );
  assert.match(packageJson.scripts["native:test"], /cargo test --locked/);
  assert.match(packageJson.scripts["desktop:prepare"], /pnpm native:stage/);
  assert.deepEqual(packageJson.build.extraResources, [
    {
      from: "build/native",
      to: "native",
      filter: ["bakbak-screen-share-helper", "bakbak-screen-share-helper.exe"],
    },
  ]);
});

test("Windows installer bridges the existing Tauri installation", () => {
  assert.equal(packageJson.build.nsis.include, "build/installer.nsh");
  assert.match(installer, /StrCpy \$INSTDIR "\$LOCALAPPDATA\\Bakbak"/);
  assert.match(installer, /\$\{GetOptions\} \$R0 "\/P"/);
  assert.match(installer, /\$\{GetOptions\} \$R0 "\/R"/);
  assert.match(installer, /Uninstall\\Bakbak"/);
  assert.match(installer, /Delete "\$INSTDIR\\uninstall\.exe"/);
  assert.match(installer, /ExecShell "open" "\$INSTDIR\\bakbak\.exe"/);
});
