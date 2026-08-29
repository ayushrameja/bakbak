const requiredVariables = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_LIVEKIT_URL",
  "VITE_BACKEND_REGION",
];

const invalid = requiredVariables.filter((name) => !process.env[name]?.trim());
validateServiceUrl("VITE_SUPABASE_URL", new Set(["https:"]), invalid);
validateServiceUrl("VITE_LIVEKIT_URL", new Set(["wss:"]), invalid);
validateSupabasePublicKey(invalid);
validateTrimmedValue("VITE_BACKEND_REGION", 128, invalid);
if (process.env.VITE_DATA_MODE !== "live") invalid.push("VITE_DATA_MODE=live");
if (!/^[0-9a-f]{40}$/i.test(process.env.VITE_BUILD_REVISION ?? "")) {
  invalid.push("VITE_BUILD_REVISION=<40-character commit SHA>");
}

if (invalid.length > 0) {
  throw new Error(
    `Release environment is incomplete or invalid: ${[...new Set(invalid)].join(", ")}`,
  );
}

process.stdout.write(
  "Release renderer environment is configured for live services.\n",
);

function validateServiceUrl(name, protocols, invalid) {
  const value = process.env[name];
  if (!value?.trim()) return;
  try {
    const parsed = new URL(value);
    if (
      value !== value.trim() ||
      !protocols.has(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      invalid.push(`${name}=valid ${[...protocols].join("/")} URL`);
    }
  } catch {
    invalid.push(`${name}=valid ${[...protocols].join("/")} URL`);
  }
}

function validateTrimmedValue(name, maxLength, invalid) {
  const value = process.env[name];
  if (!value?.trim()) return;
  if (
    value !== value.trim() ||
    value.length > maxLength ||
    hasControlCharacter(value)
  ) {
    invalid.push(`${name}=bounded trimmed value`);
  }
}

function validateSupabasePublicKey(invalid) {
  const name = "VITE_SUPABASE_ANON_KEY";
  const value = process.env[name];
  if (!value?.trim()) return;
  validateTrimmedValue(name, 8_192, invalid);
  if (value !== value.trim()) return;

  if (/^sb_publishable_[A-Za-z0-9_-]{16,512}$/u.test(value)) return;
  if (value.startsWith("sb_secret_")) {
    invalid.push(`${name}=Supabase anon or publishable key`);
    return;
  }

  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    parts.some(
      (part) =>
        part.length === 0 ||
        part.length > 4_096 ||
        !/^[A-Za-z0-9_-]+$/u.test(part),
    )
  ) {
    invalid.push(`${name}=Supabase anon or publishable key`);
    return;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (
      typeof payload !== "object" ||
      payload === null ||
      payload.role !== "anon"
    ) {
      invalid.push(`${name}=Supabase anon or publishable key`);
    }
  } catch {
    invalid.push(`${name}=Supabase anon or publishable key`);
  }
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}
