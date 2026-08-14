use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};

use tokio::sync::watch;
use windows::Win32::{
    Foundation::CloseHandle,
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        },
        Threading::GetCurrentProcessId,
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

    pub(crate) fn is_valid_for(&self, parents: &HashMap<u32, u32>) -> bool {
        self.browser_process_id != 0
            && parents.contains_key(&self.browser_process_id)
            && self
                .process_ids
                .iter()
                .all(|process_id| process_is_in_tree(*process_id, self.browser_process_id, parents))
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
}

impl WebViewProcessTracker {
    pub(crate) fn start_electron(root_pid: u32) -> Result<Self, String> {
        verify_direct_parent(root_pid)?;
        // A transient snapshot failure must not disable video capture. Audio
        // remains disabled unless there is a positive, current tree proof.
        let initial = prove_electron_tree(root_pid)
            .map(WebViewProcessState::Proven)
            .unwrap_or(WebViewProcessState::Unavailable);
        let (sender, _) = watch::channel(initial);
        let tracker = Self { sender };
        let sender = tracker.sender.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(1));
            loop {
                interval.tick().await;
                let state = prove_electron_tree(root_pid)
                    .map(WebViewProcessState::Proven)
                    .unwrap_or(WebViewProcessState::Unavailable);
                sender.send_replace(state);
            }
        });
        Ok(tracker)
    }

    pub(crate) fn current_proof(&self) -> Option<WebViewProcessProof> {
        self.sender.borrow().proof().cloned()
    }

    pub(crate) fn subscribe(&self) -> watch::Receiver<WebViewProcessState> {
        self.sender.subscribe()
    }
}

pub(crate) fn verify_direct_parent(root_pid: u32) -> Result<(), String> {
    if root_pid == 0 {
        return Err("The Electron root process is invalid.".into());
    }
    let current = unsafe { GetCurrentProcessId() };
    let parents = process_parent_map()?;
    if parents.get(&current).copied() != Some(root_pid) {
        return Err("The helper is not a direct child of the declared Electron root.".into());
    }
    Ok(())
}

pub(crate) fn prove_electron_tree(root_pid: u32) -> Result<WebViewProcessProof, String> {
    let parents = process_parent_map()?;
    if !parents.contains_key(&root_pid) {
        return Err("The Electron process tree is unavailable.".into());
    }
    let process_ids = parents
        .keys()
        .copied()
        .filter(|process_id| process_is_in_tree(*process_id, root_pid, &parents))
        .collect::<HashSet<_>>();
    if process_ids.is_empty() {
        return Err("The Electron process tree is empty.".into());
    }
    Ok(WebViewProcessProof {
        browser_process_id: root_pid,
        process_ids: Arc::new(process_ids),
    })
}

pub(crate) fn process_parent_map() -> Result<HashMap<u32, u32>, String> {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }
        .map_err(|_| "Windows could not inspect application processes.".to_string())?;
    let mut result = HashMap::new();
    let mut entry = PROCESSENTRY32W {
        dwSize: size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    if unsafe { Process32FirstW(snapshot, &mut entry) }.is_err() {
        let _ = unsafe { CloseHandle(snapshot) };
        return Err("Windows could not inspect the first application process.".into());
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

pub(crate) fn process_is_in_tree(
    process_id: u32,
    root_process_id: u32,
    parents: &HashMap<u32, u32>,
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
        let Some(parent) = parents.get(&current).copied() else {
            return false;
        };
        if parent == 0 || parent == current {
            return false;
        }
        current = parent;
    }
    false
}
