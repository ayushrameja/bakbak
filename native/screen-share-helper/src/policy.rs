use std::collections::{HashMap, HashSet};

use crate::model::{HelloPayload, HelperError, SourceKind};

#[derive(Clone)]
pub struct HostIdentity {
    pub electron_root_pid: u32,
    pub bundle_id: String,
    pub app_version: String,
}

impl HostIdentity {
    pub fn from_hello(payload: HelloPayload) -> Result<Self, HelperError> {
        if payload.electron_root_pid == 0
            || payload.bundle_id.is_empty()
            || payload.bundle_id.len() > 255
            || payload.bundle_id.chars().any(char::is_whitespace)
            || payload.app_version.is_empty()
            || payload.app_version.len() > 64
        {
            return Err(HelperError::invalid(
                "invalid-hello",
                "The desktop host identity is invalid.",
            ));
        }
        Ok(Self {
            electron_root_pid: payload.electron_root_pid,
            bundle_id: payload.bundle_id,
            app_version: payload.app_version,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AudioIsolationPolicy {
    Disabled,
    ExcludeElectronProcessTree(u32),
    IncludeSelectedProcessTree(u32),
    ExcludeMacApplications,
}

pub fn choose_audio_policy(
    include_audio: bool,
    supported: bool,
    source_kind: SourceKind,
    electron_root_pid: u32,
    selected_process_id: Option<u32>,
    process_trees_overlap: bool,
) -> Result<AudioIsolationPolicy, HelperError> {
    if !include_audio {
        return Ok(AudioIsolationPolicy::Disabled);
    }
    if !supported {
        return Ok(AudioIsolationPolicy::Disabled);
    }
    match source_kind {
        SourceKind::Display => Ok(AudioIsolationPolicy::ExcludeElectronProcessTree(
            electron_root_pid,
        )),
        SourceKind::Application => {
            let process_id = selected_process_id
                .filter(|value| *value != 0)
                .ok_or_else(|| {
                    HelperError::invalid(
                        "audio-isolation-unavailable",
                        "The selected application process tree could not be verified.",
                    )
                })?;
            if process_trees_overlap {
                return Err(HelperError::invalid(
                    "audio-isolation-unavailable",
                    "Bakbak cannot capture its own application audio.",
                ));
            }
            Ok(AudioIsolationPolicy::IncludeSelectedProcessTree(process_id))
        }
    }
}

pub fn process_is_in_tree(
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

pub fn process_trees_overlap(left: u32, right: u32, parents: &HashMap<u32, u32>) -> bool {
    process_is_in_tree(left, right, parents) || process_is_in_tree(right, left, parents)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PublishedAudioState {
    Disabled,
    Published,
    Downgraded,
}

impl PublishedAudioState {
    pub fn isolation_lost(&mut self) -> bool {
        if *self != Self::Published {
            return false;
        }
        *self = Self::Downgraded;
        true
    }

    pub fn can_publish(self) -> bool {
        self == Self::Published
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_audio_excludes_the_verified_electron_root() {
        assert_eq!(
            choose_audio_policy(true, true, SourceKind::Display, 42, None, false).unwrap(),
            AudioIsolationPolicy::ExcludeElectronProcessTree(42)
        );
    }

    #[test]
    fn application_audio_rejects_host_tree_overlap() {
        let error = choose_audio_policy(true, true, SourceKind::Application, 42, Some(43), true)
            .unwrap_err();
        assert_eq!(error.code, "audio-isolation-unavailable");
    }

    #[test]
    fn unsupported_audio_downgrades_to_video_only() {
        assert_eq!(
            choose_audio_policy(true, false, SourceKind::Display, 42, None, false).unwrap(),
            AudioIsolationPolicy::Disabled
        );
    }

    #[test]
    fn process_walk_rejects_cycles_and_detects_descendants() {
        let normal = HashMap::from([(42, 1), (43, 42), (44, 43)]);
        assert!(process_is_in_tree(44, 42, &normal));
        let cycle = HashMap::from([(10, 11), (11, 10)]);
        assert!(!process_is_in_tree(10, 42, &cycle));
    }

    #[test]
    fn topology_loss_downgrades_once_and_never_republishes() {
        let mut state = PublishedAudioState::Published;
        assert!(state.isolation_lost());
        assert_eq!(state, PublishedAudioState::Downgraded);
        assert!(!state.isolation_lost());
        assert!(!state.can_publish());
    }
}
