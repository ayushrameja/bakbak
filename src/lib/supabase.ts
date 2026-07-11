import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "./env";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (appConfig.dataMode !== "live") {
    throw new Error(
      "Supabase is only available when Bakbak is configured in live mode.",
    );
  }

  client ??= createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "bakbak-auth",
    },
  });

  return client;
}
