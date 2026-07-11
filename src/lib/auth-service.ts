import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import type { AppUser } from "./types";

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials extends AuthCredentials {
  displayName: string;
  inviteCode: string;
}

export function sessionToAppUser(session: Session): AppUser {
  const metadata: unknown = session.user.user_metadata;
  const metadataName =
    typeof metadata === "object" &&
    metadata !== null &&
    "display_name" in metadata
      ? (metadata as { display_name?: unknown }).display_name
      : undefined;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    displayName:
      typeof metadataName === "string" && metadataName.trim()
        ? metadataName.trim()
        : (session.user.email?.split("@")[0] ?? "Friend"),
    avatarUrl: null,
    status: "online",
  };
}

export async function signIn(credentials: AuthCredentials): Promise<AppUser> {
  const { data, error } =
    await getSupabaseClient().auth.signInWithPassword(credentials);
  if (error) throw error;
  if (!data.session) throw new Error("Supabase did not return a session.");
  return sessionToAppUser(data.session);
}

export async function signUpAndRedeemInvite(
  credentials: SignupCredentials,
): Promise<AppUser> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options: { data: { display_name: credentials.displayName.trim() } },
  });
  if (error) throw error;
  if (!data.session) {
    throw new Error(
      "Check your email to confirm the account, then sign in and redeem the invite.",
    );
  }

  const { error: inviteError } = await supabase.rpc("redeem_invite_code", {
    p_code: credentials.inviteCode,
  });
  if (inviteError)
    throw new Error("That invite is invalid, expired, or already used.");
  return sessionToAppUser(data.session);
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
