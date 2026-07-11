import { z } from "zod";
import type { DataMode } from "./types";

const optionalUrl = z.union([z.string().url(), z.literal("")]).optional();
const publicEnvSchema = z.object({
  VITE_DATA_MODE: z.enum(["mock", "live"]).optional(),
  VITE_SUPABASE_URL: optionalUrl,
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  VITE_LIVEKIT_URL: optionalUrl,
});

const parsed = publicEnvSchema.safeParse(import.meta.env);
const publicEnv = parsed.success ? parsed.data : {};

const requestedMode: DataMode =
  publicEnv.VITE_DATA_MODE === "live" ? "live" : "mock";
const supabaseUrl = publicEnv.VITE_SUPABASE_URL || "";
const supabaseAnonKey = publicEnv.VITE_SUPABASE_ANON_KEY || "";
const livekitUrl = publicEnv.VITE_LIVEKIT_URL || "";
const hasLiveConfig = Boolean(supabaseUrl && supabaseAnonKey && livekitUrl);

export const appConfig = {
  requestedMode,
  dataMode: requestedMode === "live" && hasLiveConfig ? "live" : "mock",
  supabaseUrl,
  supabaseAnonKey,
  livekitUrl,
  configurationWarning:
    requestedMode === "live" && !hasLiveConfig
      ? "Live mode needs the three public VITE_ values from .env.example. Bakbak is using mock mode instead."
      : null,
} as const;
