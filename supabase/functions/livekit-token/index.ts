import { createClient } from "@supabase/supabase-js";
import { readAllowedOrigins } from "../_shared/cors.ts";
import { authenticateUserFromClaims } from "./auth.ts";
import {
  handleLiveKitTokenRequest,
  type TokenSigningInput,
  type VoiceChannelAccess,
} from "./handler.ts";
import { signLiveKitToken as createLiveKitToken } from "./token.ts";

interface FunctionConfiguration {
  supabaseUrl: string;
  supabaseAnonKey: string;
  livekitUrl: string | null;
  livekitApiKey: string | null;
  livekitApiSecret: string | null;
}

Deno.serve((request) => {
  const configuration = readConfiguration();

  return handleLiveKitTokenRequest(request, {
    allowedOrigins: readAllowedOrigins(Deno.env.get("BAKBAK_ALLOWED_ORIGINS")),
    serverUrl: isLiveKitConfigured(configuration)
      ? configuration.livekitUrl
      : null,
    now: () => new Date(),
    authenticate: (incomingRequest) =>
      authenticateUser(incomingRequest, configuration),
    findVoiceChannelAccess: (channelId, userId) =>
      findVoiceChannelAccess(request, configuration, channelId, userId),
    signToken: (input) => signLiveKitToken(configuration, input),
  });
});

function readConfiguration(): FunctionConfiguration {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    supabaseAnonKey: readSupabasePublicKey(),
    livekitUrl: normalizeLiveKitUrl(Deno.env.get("LIVEKIT_URL")),
    livekitApiKey: readNonEmptyEnvironmentValue("LIVEKIT_API_KEY"),
    livekitApiSecret: readNonEmptyEnvironmentValue("LIVEKIT_API_SECRET"),
  };
}

async function authenticateUser(
  request: Request,
  configuration: FunctionConfiguration,
): Promise<{ id: string } | null> {
  const authorization = request.headers.get("authorization");

  if (
    authorization === null ||
    configuration.supabaseUrl.length === 0 ||
    configuration.supabaseAnonKey.length === 0
  ) {
    return null;
  }

  const supabase = createRequestClient(
    authorization,
    configuration.supabaseUrl,
    configuration.supabaseAnonKey,
  );
  return await authenticateUserFromClaims(request, (token) =>
    supabase.auth.getClaims(token),
  );
}

async function findVoiceChannelAccess(
  request: Request,
  configuration: FunctionConfiguration,
  channelId: string,
  _userId: string,
): Promise<VoiceChannelAccess | null> {
  const authorization = request.headers.get("authorization");

  if (
    authorization === null ||
    configuration.supabaseUrl.length === 0 ||
    configuration.supabaseAnonKey.length === 0
  ) {
    return null;
  }

  const supabase = createRequestClient(
    authorization,
    configuration.supabaseUrl,
    configuration.supabaseAnonKey,
  );
  const { data, error: contextError } = await supabase
    .rpc("get_voice_join_context", { p_channel_id: channelId })
    .maybeSingle();
  const context: unknown = data;

  if (contextError !== null) {
    throw new Error("Voice access lookup failed.");
  }

  if (context === null || context === undefined) {
    return null;
  }

  if (
    !isRecord(context) ||
    typeof context.channel_id !== "string" ||
    typeof context.server_id !== "string" ||
    typeof context.display_name !== "string"
  ) {
    throw new Error("Voice access lookup returned invalid data.");
  }

  return {
    channelId: context.channel_id,
    serverId: context.server_id,
    displayName: context.display_name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createRequestClient(
  authorization: string,
  supabaseUrl: string,
  supabaseAnonKey: string,
) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: { Authorization: authorization },
    },
  });
}

async function signLiveKitToken(
  configuration: FunctionConfiguration,
  input: TokenSigningInput,
): Promise<string> {
  if (
    configuration.livekitApiKey === null ||
    configuration.livekitApiSecret === null
  ) {
    throw new Error("LiveKit signing is not configured.");
  }

  return await createLiveKitToken(
    {
      apiKey: configuration.livekitApiKey,
      apiSecret: configuration.livekitApiSecret,
    },
    input,
  );
}

function readSupabasePublicKey(): string {
  const directKey =
    readNonEmptyEnvironmentValue("SUPABASE_ANON_KEY") ??
    readNonEmptyEnvironmentValue("SUPABASE_PUBLISHABLE_KEY");

  if (directKey !== null) {
    return directKey;
  }

  const keyMap = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");

  if (keyMap === undefined) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(keyMap);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return "";
    }

    const values = Object.values(parsed).filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
    return values[0]?.trim() ?? "";
  } catch {
    return "";
  }
}

function readNonEmptyEnvironmentValue(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

function isLiveKitConfigured(
  configuration: FunctionConfiguration,
): configuration is FunctionConfiguration & {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
} {
  return (
    configuration.livekitUrl !== null &&
    configuration.livekitApiKey !== null &&
    configuration.livekitApiSecret !== null
  );
}

function normalizeLiveKitUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "wss:" || url.protocol === "ws:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
