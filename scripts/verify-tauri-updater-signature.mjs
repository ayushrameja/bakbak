import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifyEd25519,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const MAX_KEY_TEXT_BYTES = 4 * 1024;
const MAX_SIGNATURE_TEXT_BYTES = 16 * 1024;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function decodeCanonicalBase64(value, label, maxBytes) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > Math.ceil((maxBytes * 4) / 3) + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error(`${label} is not canonical base64.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > maxBytes || decoded.toString("base64") !== value) {
    throw new Error(`${label} is not canonical base64.`);
  }
  return decoded;
}

function decodeOuterText(value, label, maxBytes) {
  const decoded = decodeCanonicalBase64(value, label, maxBytes);
  try {
    return utf8Decoder.decode(decoded);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function exactLines(value, expected, label) {
  const withoutTrailingNewline = value.replace(/\r?\n$/, "");
  const lines = withoutTrailingNewline.split(/\r?\n/);
  if (lines.length !== expected) {
    throw new Error(`${label} has an invalid Minisign envelope.`);
  }
  return lines;
}

function parsePublicKey(outerPublicKey) {
  const [, encodedKey] = exactLines(
    decodeOuterText(
      outerPublicKey,
      "Tauri updater public key",
      MAX_KEY_TEXT_BYTES,
    ),
    2,
    "Tauri updater public key",
  );
  const keyRecord = decodeCanonicalBase64(
    encodedKey,
    "Minisign public key",
    42,
  );
  if (keyRecord.length !== 42) {
    throw new Error("Minisign public key has an invalid length.");
  }
  const algorithm = keyRecord.subarray(0, 2).toString("ascii");
  if (algorithm !== "Ed" && algorithm !== "ED") {
    throw new Error("Minisign public key uses an unsupported algorithm.");
  }
  return {
    keyId: keyRecord.subarray(2, 10),
    key: createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, keyRecord.subarray(10)]),
      format: "der",
      type: "spki",
    }),
  };
}

function parseSignature(outerSignature) {
  const [, encodedSignature, trustedCommentLine, encodedGlobalSignature] =
    exactLines(
      decodeOuterText(
        outerSignature,
        "Tauri updater signature",
        MAX_SIGNATURE_TEXT_BYTES,
      ),
      4,
      "Tauri updater signature",
    );
  if (!trustedCommentLine.startsWith("trusted comment: ")) {
    throw new Error("Tauri updater signature has no trusted comment.");
  }
  const signatureRecord = decodeCanonicalBase64(
    encodedSignature,
    "Minisign signature",
    74,
  );
  const globalSignature = decodeCanonicalBase64(
    encodedGlobalSignature,
    "Minisign global signature",
    64,
  );
  if (signatureRecord.length !== 74 || globalSignature.length !== 64) {
    throw new Error("Tauri updater signature has an invalid length.");
  }
  const algorithm = signatureRecord.subarray(0, 2).toString("ascii");
  if (algorithm !== "Ed" && algorithm !== "ED") {
    throw new Error("Tauri updater signature uses an unsupported algorithm.");
  }
  return {
    algorithm,
    keyId: signatureRecord.subarray(2, 10),
    signature: signatureRecord.subarray(10),
    trustedComment: trustedCommentLine.slice("trusted comment: ".length),
    globalSignature,
  };
}

export function updaterPublicKeyFromConfig(config) {
  const publicKey = config?.plugins?.updater?.pubkey;
  if (typeof publicKey !== "string" || publicKey.length === 0) {
    throw new Error("Tauri updater public key is missing from configuration.");
  }
  return publicKey;
}

export function verifyTauriUpdaterSignature({
  artifact,
  outerSignature,
  outerPublicKey,
}) {
  if (!Buffer.isBuffer(artifact) || artifact.length === 0) {
    throw new Error("Updater artifact is empty or invalid.");
  }
  const publicKey = parsePublicKey(outerPublicKey);
  const signature = parseSignature(outerSignature);
  if (
    publicKey.keyId.length !== signature.keyId.length ||
    !timingSafeEqual(publicKey.keyId, signature.keyId)
  ) {
    throw new Error("Updater signature was created by a different key.");
  }

  const signedArtifact =
    signature.algorithm === "ED"
      ? createHash("blake2b512").update(artifact).digest()
      : artifact;
  if (
    !verifyEd25519(null, signedArtifact, publicKey.key, signature.signature)
  ) {
    throw new Error("Updater signature does not match the artifact.");
  }

  const globalPayload = Buffer.concat([
    signature.signature,
    Buffer.from(signature.trustedComment, "utf8"),
  ]);
  if (
    !verifyEd25519(
      null,
      globalPayload,
      publicKey.key,
      signature.globalSignature,
    )
  ) {
    throw new Error("Updater signature trusted comment is invalid.");
  }
  return true;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const artifactPath = argumentValue("--artifact");
  const signaturePath = argumentValue("--signature");
  const configPath = argumentValue("--config");
  if (!artifactPath || !signaturePath || !configPath) {
    throw new Error(
      "Usage: node scripts/verify-tauri-updater-signature.mjs --artifact <path> --signature <path> --config <path>",
    );
  }
  const [artifact, outerSignature, configSource] = await Promise.all([
    readFile(artifactPath),
    readFile(signaturePath, "utf8"),
    readFile(configPath, "utf8"),
  ]);
  const config = JSON.parse(configSource);
  verifyTauriUpdaterSignature({
    artifact,
    outerSignature: outerSignature.trim(),
    outerPublicKey: updaterPublicKeyFromConfig(config),
  });
  process.stdout.write(
    `Verified Tauri updater signature for ${basename(artifactPath)}.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    process.stderr.write(`Updater signature verification failed: ${message}\n`);
    process.exitCode = 1;
  });
}
