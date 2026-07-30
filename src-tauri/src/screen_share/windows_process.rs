use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use tauri::WebviewWindow;
use tokio::sync::watch;
use webview2_com::{
    Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_KIND, COREWEBVIEW2_PROCESS_KIND_BROWSER, ICoreWebView2,
        ICoreWebView2Environment, ICoreWebView2Environment8,
    },
    ProcessInfosChangedEventHandler,
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
pub struct WebViewProcessProof {
    browser_process_id: u32,
    process_ids: Arc<HashSet<u32>>,
}

impl WebViewProcessProof {
    pub fn browser_process_id(&self) -> u32 {
        self.browser_process_id
    }

    pub fn is_valid_for(&self, process_parents: &HashMap<u32, u32>) -> bool {
        process_group_is_proven(
            self.browser_process_id,
            self.process_ids.iter().copied(),
            process_parents,
        )
    }

    #[cfg(test)]
    pub(crate) fn for_test(
        browser_process_id: u32,
        process_ids: impl IntoIterator<Item = u32>,
    ) -> Self {
        Self {
            browser_process_id,
            process_ids: Arc::new(process_ids.into_iter().collect()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WebViewProcessState {
    Unavailable,
    Proven(WebViewProcessProof),
}

impl WebViewProcessState {
    pub fn proof(&self) -> Option<&WebViewProcessProof> {
        match self {
            Self::Unavailable => None,
            Self::Proven(proof) => Some(proof),
        }
    }
}

#[derive(Clone)]
pub struct WebViewProcessTracker {
    sender: watch::Sender<WebViewProcessState>,
}

impl Default for WebViewProcessTracker {
    fn default() -> Self {
        let (sender, _) = watch::channel(WebViewProcessState::Unavailable);
        Self { sender }
    }
}

impl WebViewProcessTracker {
    pub fn current_proof(&self) -> Option<WebViewProcessProof> {
        self.sender.borrow().proof().cloned()
    }

    pub fn subscribe(&self) -> watch::Receiver<WebViewProcessState> {
        self.sender.subscribe()
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
        self.sender.send_replace(state);
    }
}

pub fn register_webview_process_tracker(
    window: &WebviewWindow,
    tracker: WebViewProcessTracker,
) -> Result<(), String> {
    window
        .with_webview(move |webview| {
            let environment = webview.environment();
            let core_webview = unsafe { webview.controller().CoreWebView2() }.ok();
            tracker.refresh(
                Some(environment.clone()),
                core_webview
                    .as_ref()
                    .and_then(|webview| browser_process_id(webview).ok()),
            );
            let Ok(environment8) = environment.cast::<ICoreWebView2Environment8>() else {
                tracker
                    .sender
                    .send_replace(WebViewProcessState::Unavailable);
                return;
            };
            let tracker_for_event = tracker.clone();
            let core_webview_for_event = core_webview.clone();
            let handler =
                ProcessInfosChangedEventHandler::create(Box::new(move |environment, _| {
                    tracker_for_event.refresh(
                        environment,
                        core_webview_for_event
                            .as_ref()
                            .and_then(|webview| browser_process_id(webview).ok()),
                    );
                    Ok(())
                }));
            let mut token = 0;
            if unsafe {
                environment8
                    .add_ProcessInfosChanged(&handler, &mut token)
                    .is_err()
            } {
                tracker
                    .sender
                    .send_replace(WebViewProcessState::Unavailable);
            }
        })
        .map_err(|error| format!("Bakbak could not inspect its Windows webview: {error}"))
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

pub fn process_parent_map() -> Result<HashMap<u32, u32>, String> {
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

pub fn process_is_in_tree(
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
}
