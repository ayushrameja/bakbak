import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const macos = readFileSync(
  new URL("../src-tauri/src/screen_share/platform/macos.rs", import.meta.url),
  "utf8",
);
const windows = readFileSync(
  new URL("../src-tauri/src/screen_share/platform/windows.rs", import.meta.url),
  "utf8",
);
const screenShareManager = readFileSync(
  new URL("../src-tauri/src/screen_share/mod.rs", import.meta.url),
  "utf8",
);
const voiceRoom = readFileSync(
  new URL("../src/features/voice/useVoiceRoom.ts", import.meta.url),
  "utf8",
);

test("macOS screen audio keeps Bakbak outside every capture tree", () => {
  assert.match(macos, /with_excludes_current_process_audio\(true\)/);
  assert.match(
    macos,
    /isolated_audio_requested\s*&&\s*!configuration\.excludes_current_process_audio\(\)/,
  );
  assert.match(macos, /with_excluding_applications\(&excluded, &\[\]\)/);
  assert.match(
    macos,
    /process_tree_overlaps_current\(application\.process_id\(\)\)/,
  );
  assert.match(
    macos,
    /process_is_in_tree_with_policy\([\s\S]*?left_process_id,[\s\S]*?right_process_id,[\s\S]*?\|\| process_is_in_tree_with_policy\([\s\S]*?right_process_id,[\s\S]*?left_process_id/,
  );
  assert.match(
    macos,
    /Err\(_\) if prepared\.includes_audio\(\)[\s\S]*?start_capture_attempt\(&prepared, video_source, None, false\)/,
  );
  assert.match(screenShareManager, /"exclude-bakbak-process-tree"/);
});

test("Windows screen audio remains process-filtered and fail-closed", () => {
  assert.match(
    windows,
    /ProcessLoopbackTarget::ExcludeProcessTree\(\s*proof\.browser_process_id\(\),?\s*\)/,
  );
  assert.match(
    windows,
    /ProcessLoopbackTarget::IncludeProcessTree\(process_id\)/,
  );
  assert.match(
    windows,
    /fn process_trees_overlap_or_are_unproven\([\s\S]*?!process_parents\.contains_key\(&left_process_id\)[\s\S]*?!process_parents\.contains_key\(&right_process_id\)/,
  );
  assert.match(
    windows,
    /process_is_in_tree\(left_process_id, right_process_id, process_parents\)/,
  );
  assert.match(
    windows,
    /process_is_in_tree\(right_process_id, left_process_id, process_parents\)/,
  );
  assert.match(
    windows,
    /application_audio_availability_for\([\s\S]*?application_process_loopback_target/,
  );
  assert.match(windows, /should_stop_for_isolation_change/);
  assert.match(
    screenShareManager,
    /current\.capture\.stop_audio\(\)\.await;[\s\S]*?unpublish_track/,
  );
  assert.match(screenShareManager, /"exclude-webview2-process-tree"/);
});

test("renderer screen sharing cannot bypass native isolation", () => {
  assert.match(
    voiceRoom,
    /includeAudio:\s*includeAudio\s*&&\s*screenShareCapabilities\.systemAudio/,
  );
  assert.match(voiceRoom, /setScreenShareEnabled\([\s\S]*?audio:\s*false/);
});
