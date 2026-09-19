use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

use tauri::{Manager, WebviewWindow};
use tokio::sync::watch;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
        COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED, COREWEBVIEW2_PROCESS_KIND,
        COREWEBVIEW2_PROCESS_KIND_BROWSER, ICoreWebView2, ICoreWebView2Environment,
        ICoreWebView2Environment8, ICoreWebView2ProcessFailedEventArgs,
    },
    ProcessFailedEventHandler, ProcessInfosChangedEventHandler,
};
use webview2_windows_core::Interface;
use windows::Win32::{
    Foundation::CloseHandle,
    System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    },
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct WebViewProcessProof {
    browser_process_id: u32,
    process_ids: Arc<HashSet<u32>>,
}

impl WebViewProcessProof {
    pub(crate) fn browser_process_id(&self) -> u32 {
        self.browser_process_id
    }

    pub(crate) fn is_valid_for(&self, process_parents: &HashMap<u32, u32>) -> bool {
        process_group_is_proven(
            self.browser_process_id,
            self.process_ids.iter().copied(),
            process_parents,
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum WebViewProcessState {
    Unavailable,
    Proven(WebViewProcessProof),
}

impl WebViewProcessState {
    pub(crate) fn proof(&self) -> Option<&WebViewProcessProof> {
        match self {
            Self::Unavailable => None,
            Self::Proven(proof) => Some(proof),
        }
    }
}

#[derive(Clone)]
pub(crate) struct WebViewProcessTracker {
    sender: watch::Sender<WebViewProcessState>,
    identity_epoch: Arc<AtomicU64>,
}

impl Default for WebViewProcessTracker {
    fn default() -> Self {
        let (sender, _) = watch::channel(WebViewProcessState::Unavailable);
        Self {
            sender,
            identity_epoch: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl WebViewProcessTracker {
    pub(crate) fn current_proof(&self) -> Option<WebViewProcessProof> {
        self.sender.borrow().proof().cloned()
    }

    pub(crate) fn current_audio_root(&self) -> Option<u32> {
        let proof = self.current_proof()?;
        let parents = process_parent_map().ok()?;
        proof
            .is_valid_for(&parents)
            .then(|| proof.browser_process_id())
    }

    pub(crate) fn subscribe(&self) -> watch::Receiver<WebViewProcessState> {
        self.sender.subscribe()
    }

    pub(crate) fn identity_epoch(&self) -> u64 {
        self.identity_epoch.load(Ordering::Acquire)
    }

    fn replace_state(&self, state: WebViewProcessState) {
        self.sender.send_if_modified(|current| {
            if *current == state {
                return false;
            }
            self.identity_epoch.fetch_add(1, Ordering::AcqRel);
            *current = state;
            true
        });
    }

    fn refresh(
        &self,
        environment: Option<ICoreWebView2Environment>,
        browser_process_id: Option<u32>,
    ) {
        let state = environment
            .zip(browser_process_id)
            .ok_or(())
            .and_then(|(environment, browser_process_id)| {
                read_process_group(&environment, browser_process_id).map_err(|_| ())
            })
            .map(WebViewProcessState::Proven)
            .unwrap_or(WebViewProcessState::Unavailable);
        self.replace_state(state);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WebViewFailureAction {
    Reload,
    Restart,
    IgnoreRecoveredAuxiliary,
}

fn webview_failure_action(kind: Option<COREWEBVIEW2_PROCESS_FAILED_KIND>) -> WebViewFailureAction {
    match kind {
        Some(
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
        ) => WebViewFailureAction::Reload,
        Some(
            COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED,
        ) => WebViewFailureAction::IgnoreRecoveredAuxiliary,
        Some(
            COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED
            | COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
        )
        | None => WebViewFailureAction::Restart,
        Some(_) => WebViewFailureAction::Restart,
    }
}

fn failure_action_requires_screen_share_stop(action: WebViewFailureAction) -> bool {
    matches!(
        action,
        WebViewFailureAction::Reload | WebViewFailureAction::Restart
    )
}

fn process_failed_kind(
    args: Option<&ICoreWebView2ProcessFailedEventArgs>,
) -> Option<COREWEBVIEW2_PROCESS_FAILED_KIND> {
    let args = args?;
    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
    unsafe { args.ProcessFailedKind(&mut kind) }.ok()?;
    Some(kind)
}

pub(crate) fn register_webview_process_tracker(
    window: &WebviewWindow,
    tracker: WebViewProcessTracker,
) -> Result<(), String> {
    let hooks_ready = Arc::new(AtomicBool::new(false));
    let hooks_ready_in_webview = hooks_ready.clone();
    let tracker_after_registration = tracker.clone();
    let app = window.app_handle().clone();
    if let Err(error) = window.with_webview(move |webview| {
        let environment = webview.environment();
        let core_webview = unsafe { webview.controller().CoreWebView2() }.ok();
        let Some(core_webview_for_failure) = core_webview.clone() else {
            tracker.replace_state(WebViewProcessState::Unavailable);
            return;
        };
        let app_for_failure = app.clone();
        let handler = ProcessFailedEventHandler::create(Box::new(move |sender, args| {
            let action = webview_failure_action(process_failed_kind(args.as_ref()));
            if failure_action_requires_screen_share_stop(action) {
                crate::screen_share::stop_for_shutdown(&app_for_failure);
            }
            match action {
                WebViewFailureAction::Reload => {
                    if sender
                        .as_ref()
                        .is_none_or(|webview| unsafe { webview.Reload() }.is_err())
                    {
                        app_for_failure.request_restart();
                    }
                }
                WebViewFailureAction::Restart => {
                    app_for_failure.request_restart();
                }
                WebViewFailureAction::IgnoreRecoveredAuxiliary => {}
            }
            Ok(())
        }));
        let mut token = 0;
        if unsafe { core_webview_for_failure.add_ProcessFailed(&handler, &mut token) }.is_err() {
            tracker.replace_state(WebViewProcessState::Unavailable);
            return;
        }
        let Ok(environment8) = environment.cast::<ICoreWebView2Environment8>() else {
            tracker.replace_state(WebViewProcessState::Unavailable);
            return;
        };
        let tracker_for_event = tracker.clone();
        let core_webview_for_event = core_webview.clone();
        let hooks_ready_for_event = hooks_ready_in_webview.clone();
        let handler = ProcessInfosChangedEventHandler::create(Box::new(move |environment, _| {
            if !hooks_ready_for_event.load(Ordering::Acquire) {
                tracker_for_event.replace_state(WebViewProcessState::Unavailable);
                return Ok(());
            }
            tracker_for_event.refresh(
                environment,
                core_webview_for_event
                    .as_ref()
                    .and_then(|webview| browser_process_id(webview).ok()),
            );
            Ok(())
        }));
        let mut token = 0;
        if unsafe { environment8.add_ProcessInfosChanged(&handler, &mut token) }.is_err() {
            tracker.replace_state(WebViewProcessState::Unavailable);
            return;
        }

        hooks_ready_in_webview.store(true, Ordering::Release);
        tracker.refresh(
            Some(environment),
            core_webview
                .as_ref()
                .and_then(|webview| browser_process_id(webview).ok()),
        );
    }) {
        tracker_after_registration.replace_state(WebViewProcessState::Unavailable);
        return Err(format!(
            "Bakbak could not inspect its Windows webview: {error}"
        ));
    }
    if !hooks_ready.load(Ordering::Acquire) {
        tracker_after_registration.replace_state(WebViewProcessState::Unavailable);
        return Err("Bakbak could not install bounded Windows webview recovery hooks.".into());
    }
    Ok(())
}

fn read_process_group(
    environment: &ICoreWebView2Environment,
    browser_process_id: u32,
) -> Result<WebViewProcessProof, String> {
    let environment8 = environment
        .cast::<ICoreWebView2Environment8>()
        .map_err(|_| {
            "The installed WebView2 runtime cannot report its process group.".to_string()
        })?;
    let collection = unsafe {
        environment8
            .GetProcessInfos()
            .map_err(|_| "WebView2 did not return its process group.".to_string())?
    };
    let mut count = 0;
    unsafe {
        collection
            .Count(&mut count)
            .map_err(|_| "WebView2 did not return its process count.".to_string())?;
    }
    let mut browser_processes = Vec::new();
    let mut process_ids = HashSet::new();
    for index in 0..count {
        let info = unsafe {
            collection
                .GetValueAtIndex(index)
                .map_err(|_| "WebView2 returned an invalid process entry.".to_string())?
        };
        let mut process_id = 0i32;
        let mut kind = COREWEBVIEW2_PROCESS_KIND::default();
        unsafe {
            info.ProcessId(&mut process_id)
                .map_err(|_| "WebView2 returned an invalid process identifier.".to_string())?;
            info.Kind(&mut kind)
                .map_err(|_| "WebView2 returned an invalid process kind.".to_string())?;
        }
        let process_id = u32::try_from(process_id)
            .ok()
            .filter(|process_id| *process_id != 0)
            .ok_or_else(|| "WebView2 returned an invalid process identifier.".to_string())?;
        process_ids.insert(process_id);
        if kind == COREWEBVIEW2_PROCESS_KIND_BROWSER {
            browser_processes.push(process_id);
        }
    }

    let process_parents = process_parent_map()?;
    prove_process_group(
        browser_process_id,
        &browser_processes,
        process_ids,
        &process_parents,
    )
    .ok_or_else(|| "WebView2's process group is not one verifiable process tree.".to_string())
}

fn browser_process_id(webview: &ICoreWebView2) -> Result<u32, String> {
    let mut process_id = 0;
    unsafe {
        webview
            .BrowserProcessId(&mut process_id)
            .map_err(|_| "WebView2 did not return its browser process.".to_string())?;
    }
    (process_id != 0)
        .then_some(process_id)
        .ok_or_else(|| "WebView2 returned an invalid browser process.".to_string())
}

pub(crate) fn process_parent_map() -> Result<HashMap<u32, u32>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
        .map_err(|error| format!("Windows could not inspect application processes: {error}"))?;
    let mut result = HashMap::new();
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    if let Err(error) = unsafe { Process32FirstW(snapshot, &mut entry) } {
        let _ = unsafe { CloseHandle(snapshot) };
        return Err(format!(
            "Windows could not inspect the first application process: {error}"
        ));
    }
    loop {
        result.insert(entry.th32ProcessID, entry.th32ParentProcessID);
        if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
            break;
        }
    }
    let _ = unsafe { CloseHandle(snapshot) };
    Ok(result)
}

fn process_is_in_tree(
    process_id: u32,
    root_process_id: u32,
    process_parents: &HashMap<u32, u32>,
) -> bool {
    if process_id == 0 || root_process_id == 0 {
        return false;
    }
    let mut current = process_id;
    let mut visited = HashSet::new();
    while visited.insert(current) {
        if current == root_process_id {
            return true;
        }
        let Some(parent) = process_parents.get(&current).copied() else {
            return false;
        };
        if parent == 0 || parent == current {
            return false;
        }
        current = parent;
    }
    false
}

fn process_group_is_proven(
    browser_process_id: u32,
    process_ids: impl IntoIterator<Item = u32>,
    process_parents: &HashMap<u32, u32>,
) -> bool {
    browser_process_id != 0
        && process_parents.contains_key(&browser_process_id)
        && process_ids
            .into_iter()
            .all(|process_id| process_is_in_tree(process_id, browser_process_id, process_parents))
}

fn prove_process_group(
    expected_browser_process_id: u32,
    browser_processes: &[u32],
    process_ids: HashSet<u32>,
    process_parents: &HashMap<u32, u32>,
) -> Option<WebViewProcessProof> {
    let [browser_process_id] = browser_processes else {
        return None;
    };
    if *browser_process_id != expected_browser_process_id {
        return None;
    }
    if !process_ids.contains(browser_process_id) {
        return None;
    }
    process_group_is_proven(
        *browser_process_id,
        process_ids.iter().copied(),
        process_parents,
    )
    .then(|| WebViewProcessProof {
        browser_process_id: *browser_process_id,
        process_ids: Arc::new(process_ids),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proves_one_browser_root_and_every_reported_descendant() {
        let parents = HashMap::from([(10, 1), (11, 10), (12, 10), (13, 11)]);
        assert!(process_group_is_proven(10, [10, 11, 12, 13], &parents));
    }

    #[test]
    fn rejects_zero_missing_and_detached_browser_groups() {
        let parents = HashMap::from([(10, 1), (11, 10), (20, 1)]);
        assert!(!process_group_is_proven(0, [10, 11], &parents));
        assert!(!process_group_is_proven(30, [30], &parents));
        assert!(!process_group_is_proven(10, [10, 11, 20], &parents));
    }

    #[test]
    fn rejects_missing_or_multiple_browser_roots() {
        let parents = HashMap::from([(10, 1), (11, 10), (20, 1)]);
        let processes = HashSet::from([10, 11]);
        assert!(prove_process_group(10, &[], processes.clone(), &parents).is_none());
        assert!(prove_process_group(10, &[10, 20], processes, &parents).is_none());
        assert!(prove_process_group(10, &[10], HashSet::from([11]), &parents).is_none());
        assert!(prove_process_group(20, &[10], HashSet::from([10, 11]), &parents).is_none());
    }

    #[test]
    fn rejects_cycles_in_process_tree_walks() {
        let parents = HashMap::from([(11, 12), (12, 11)]);
        assert!(!process_is_in_tree(11, 10, &parents));
    }

    #[test]
    fn identity_epoch_advances_only_when_the_proof_changes() {
        let tracker = WebViewProcessTracker::default();
        let proof = WebViewProcessProof {
            browser_process_id: 10,
            process_ids: Arc::new(HashSet::from([10, 11])),
        };

        tracker.replace_state(WebViewProcessState::Unavailable);
        assert_eq!(tracker.identity_epoch(), 0);
        tracker.replace_state(WebViewProcessState::Proven(proof.clone()));
        assert_eq!(tracker.identity_epoch(), 1);
        tracker.replace_state(WebViewProcessState::Proven(proof));
        assert_eq!(tracker.identity_epoch(), 1);
        tracker.replace_state(WebViewProcessState::Unavailable);
        assert_eq!(tracker.identity_epoch(), 2);
    }

    #[test]
    fn process_failure_kinds_choose_bounded_reload_restart_or_ignore() {
        for kind in [
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
        ] {
            assert_eq!(
                webview_failure_action(Some(kind)),
                WebViewFailureAction::Reload
            );
        }
        for kind in [
            COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_PLUGIN_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_PPAPI_BROKER_PROCESS_EXITED,
        ] {
            assert_eq!(
                webview_failure_action(Some(kind)),
                WebViewFailureAction::IgnoreRecoveredAuxiliary
            );
        }
        for kind in [
            COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND(10_000),
        ] {
            assert_eq!(
                webview_failure_action(Some(kind)),
                WebViewFailureAction::Restart
            );
        }
        assert_eq!(webview_failure_action(None), WebViewFailureAction::Restart);
    }

    #[test]
    fn destructive_renderer_recovery_actions_stop_screen_sharing() {
        assert!(failure_action_requires_screen_share_stop(
            WebViewFailureAction::Reload
        ));
        assert!(failure_action_requires_screen_share_stop(
            WebViewFailureAction::Restart
        ));
        assert!(!failure_action_requires_screen_share_stop(
            WebViewFailureAction::IgnoreRecoveredAuxiliary
        ));
    }
}
