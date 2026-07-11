const requiredVariables = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_LIVEKIT_URL",
];

const missing = requiredVariables.filter((name) => !process.env[name]?.trim());
if (process.env.VITE_DATA_MODE !== "live") missing.push("VITE_DATA_MODE=live");

if (missing.length > 0) {
  throw new Error(`Release environment is incomplete: ${missing.join(", ")}`);
}

process.stdout.write(
  "Release renderer environment is configured for live services.\n",
);
