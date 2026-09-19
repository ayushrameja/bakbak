import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { nextPatchVersion } from "./update-rehearsal-version.mjs";

export const REHEARSAL_PORT = 41793;
export const REHEARSAL_ORIGIN = `http://127.0.0.1:${REHEARSAL_PORT}`;
export const REHEARSAL_MANIFEST_URL = `${REHEARSAL_ORIGIN}/latest.json`;

const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const WORKFLOW_RUN_PATTERN = /^\d+\.\d+$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIGNATURE_CHARACTERS = 8 * 1024;

function expectedInstallerName(version, role) {
  return `Bakbak-${version}-windows-x64-${role}-setup.exe`;
}

function validateIdentity({
  baseVersion,
  nextVersion,
  sourceSha,
  workflowRun,
}) {
  if (nextPatchVersion(baseVersion) !== nextVersion) {
    throw new Error(
      `Rehearsal next version ${nextVersion} is not the patch after ${baseVersion}.`,
    );
  }
  if (!SOURCE_SHA_PATTERN.test(sourceSha)) {
    throw new Error(
      "Rehearsal source must be an exact 40-character commit SHA.",
    );
  }
  if (!WORKFLOW_RUN_PATTERN.test(workflowRun)) {
    throw new Error("Rehearsal workflow run must be <run-id>.<run-attempt>.");
  }
}

async function readSignature(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Updater signature ${basename(path)} is empty.`);
  }
  if (metadata.size > MAX_SIGNATURE_CHARACTERS + 2) {
    throw new Error(
      `Updater signature ${basename(path)} is unexpectedly large.`,
    );
  }
  const signature = (await readFile(path, "utf8")).trim();
  if (
    signature.length === 0 ||
    signature.length > MAX_SIGNATURE_CHARACTERS ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    throw new Error(`Updater signature ${basename(path)} is malformed.`);
  }
  return signature;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function artifactRecord(path, role) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Rehearsal artifact ${basename(path)} is empty.`);
  }
  return {
    role,
    file: basename(path),
    bytes: metadata.size,
    sha256: await sha256(path),
  };
}

function validateRehearsalConfig(config) {
  const updater = config?.plugins?.updater;
  if (
    updater?.dangerousInsecureTransportProtocol !== true ||
    !Array.isArray(updater.endpoints) ||
    updater.endpoints.length !== 1 ||
    updater.endpoints[0] !== REHEARSAL_MANIFEST_URL
  ) {
    throw new Error(
      `Rehearsal updater config must use only ${REHEARSAL_MANIFEST_URL} with insecure transport explicitly enabled.`,
    );
  }
  if (
    updater.dangerousAcceptInvalidCerts === true ||
    updater.dangerousAcceptInvalidHostnames === true
  ) {
    throw new Error("Rehearsal updater config must not weaken TLS validation.");
  }
}

function instructions({ baseVersion, nextVersion, sourceSha, workflowRun }) {
  const baseInstaller = expectedInstallerName(baseVersion, "base");
  const nextInstaller = expectedInstallerName(nextVersion, "next");
  return `Bakbak private Windows update rehearsal
=======================================

This kit does not publish a release and does not prove that the installed test passed.
It was built from source revision ${sourceSha} in workflow run ${workflowRun}.

1. Extract this entire private Actions artifact into one local folder on the Windows test machine.
2. Compare every file's SHA-256 with rehearsal-provenance.json. In PowerShell, use:
   Get-FileHash -Algorithm SHA256 .\\${baseInstaller}
   Get-FileHash -Algorithm SHA256 .\\${nextInstaller}
3. In that folder, start the loopback-only server and keep it running:
   py -3 -m http.server ${REHEARSAL_PORT} --bind 127.0.0.1 --directory .
4. Confirm http://127.0.0.1:${REHEARSAL_PORT}/latest.json opens only on this machine.
5. Install ${baseInstaller}; the installed version must report ${baseVersion}.
6. Open Bakbak Settings > Updates, check for an update, and install ${nextVersion}.
7. Confirm Bakbak relaunches as ${nextVersion}, then stop the local server.
8. Record the source revision, workflow run, both installer hashes, signed-update result, and observed installed versions in docs/progress.md. Do not mark the release gate complete unless the full installed acceptance matrix also passed.

The update manifest downloads ${nextInstaller} only from ${REHEARSAL_ORIGIN}.
Never expose this rehearsal server on a LAN interface or reuse this config for a release build.
`;
}

export async function createUpdateRehearsalKit({
  baseVersion,
  nextVersion,
  sourceSha,
  workflowRun,
  baseInstaller,
  nextInstaller,
  configPath,
  outputDirectory,
  createdAt = new Date().toISOString(),
}) {
  validateIdentity({ baseVersion, nextVersion, sourceSha, workflowRun });
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("Rehearsal creation time must be an ISO timestamp.");
  }

  const expectedBaseName = expectedInstallerName(baseVersion, "base");
  const expectedNextName = expectedInstallerName(nextVersion, "next");
  if (basename(baseInstaller) !== expectedBaseName) {
    throw new Error(`Base installer must be named ${expectedBaseName}.`);
  }
  if (basename(nextInstaller) !== expectedNextName) {
    throw new Error(`Next installer must be named ${expectedNextName}.`);
  }

  const config = JSON.parse(await readFile(configPath, "utf8"));
  validateRehearsalConfig(config);
  const nextSignature = await readSignature(`${nextInstaller}.sig`);
  await readSignature(`${baseInstaller}.sig`);

  await mkdir(outputDirectory, { recursive: true });
  const manifestPath = join(outputDirectory, "latest.json");
  const instructionPath = join(outputDirectory, "REHEARSAL-INSTRUCTIONS.txt");
  const updaterEntry = {
    signature: nextSignature,
    url: `${REHEARSAL_ORIGIN}/${encodeURIComponent(expectedNextName)}`,
  };
  const manifest = {
    version: nextVersion,
    notes: `Private loopback-only Bakbak update rehearsal from ${baseVersion} to ${nextVersion}.`,
    pub_date: new Date(createdAt).toISOString(),
    platforms: {
      "windows-x86_64": updaterEntry,
      "windows-x86_64-nsis": updaterEntry,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    instructionPath,
    instructions({ baseVersion, nextVersion, sourceSha, workflowRun }),
  );

  const artifacts = await Promise.all([
    artifactRecord(baseInstaller, "base-installer"),
    artifactRecord(`${baseInstaller}.sig`, "base-updater-signature"),
    artifactRecord(nextInstaller, "next-installer"),
    artifactRecord(`${nextInstaller}.sig`, "next-updater-signature"),
    artifactRecord(configPath, "rehearsal-updater-config"),
    artifactRecord(manifestPath, "local-updater-manifest"),
    artifactRecord(instructionPath, "instructions"),
  ]);
  const provenance = {
    schemaVersion: 1,
    kind: "bakbak-windows-update-rehearsal",
    sourceRevision: sourceSha.toLowerCase(),
    workflowRun,
    baseVersion,
    nextVersion,
    createdAt: new Date(createdAt).toISOString(),
    updaterEndpoint: REHEARSAL_MANIFEST_URL,
    privateArtifact: true,
    publicRelease: false,
    acceptanceStatus: "not-run",
    artifacts,
  };
  const provenancePath = join(outputDirectory, "rehearsal-provenance.json");
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

  return { manifest, provenance, provenancePath };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = await createUpdateRehearsalKit({
    baseVersion: argumentValue("--base-version"),
    nextVersion: argumentValue("--next-version"),
    sourceSha: argumentValue("--source-sha"),
    workflowRun: argumentValue("--workflow-run"),
    baseInstaller: argumentValue("--base-installer"),
    nextInstaller: argumentValue("--next-installer"),
    configPath: argumentValue("--config"),
    outputDirectory: argumentValue("--output"),
  });
  process.stdout.write(
    `Wrote private update rehearsal kit for ${result.provenance.baseVersion} -> ${result.provenance.nextVersion}.\n`,
  );
}
