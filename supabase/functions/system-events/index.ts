import { createClient } from "@supabase/supabase-js";
import {
  handleSystemEventRequest,
  type ReleaseAnnouncement,
} from "./request.ts";

Deno.serve((request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const secret = Deno.env.get("BAKBAK_SYSTEM_EVENTS_SECRET") ?? "";
  return handleSystemEventRequest(request, {
    secret,
    publish: async (announcement) =>
      await publishRelease(supabaseUrl, serviceRoleKey, announcement),
  });
});

async function publishRelease(
  supabaseUrl: string,
  serviceRoleKey: string,
  announcement: ReleaseAnnouncement,
): Promise<{ id: string }> {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("service_unavailable");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client
    .rpc("publish_system_release", {
      p_release_id: announcement.release.id,
      p_tag: announcement.release.tag_name,
      p_name: announcement.release.name,
      p_notes: announcement.release.body,
      p_url: announcement.release.html_url,
      p_published_at: announcement.release.published_at,
      p_historical: announcement.historical,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw error ?? new Error("publication_failed");
  return data;
}
