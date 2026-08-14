use livekit::webrtc::{
    audio_source::native::NativeAudioSource, video_source::native::NativeVideoSource,
};
use tokio::sync::mpsc;

use super::{windows_legacy as legacy, *};
use crate::{
    ScreenShareSettings, ScreenShareSourceKind,
    windows_process::{WebViewProcessTracker, prove_electron_tree, verify_direct_parent},
};

pub struct PreparedCapture {
    inner: legacy::PreparedCapture,
    metadata: PreparedMetadata,
}

impl PreparedCapture {
    pub fn metadata(&self) -> PreparedMetadata {
        self.metadata.clone()
    }

    pub fn includes_audio(&self) -> bool {
        self.inner.includes_audio()
    }
}

pub struct CaptureSession {
    inner: legacy::CaptureSession,
}

impl CaptureSession {
    pub async fn stop(self) {
        self.inner.stop().await;
    }

    pub async fn stop_audio(&mut self) {
        self.inner.stop_audio().await;
    }

    pub async fn update_settings(&self, settings: CaptureSettings) -> Result<(), HelperError> {
        self.inner
            .update_settings(ScreenShareSettings::from_capture(settings))
            .await
            .map_err(|_| {
                HelperError::retryable(
                    "update-failed",
                    "Windows could not apply the new screen quality.",
                )
            })
    }
}

pub fn platform_name() -> PlatformName {
    PlatformName::Windows
}

pub fn capture_backend() -> &'static str {
    "windows-graphics-capture-wasapi-livekit"
}

pub fn capabilities() -> Capabilities {
    let legacy = legacy::capabilities();
    Capabilities {
        video: legacy.available && legacy.native_capture,
        system_audio: legacy.system_audio,
        application_audio: legacy.system_audio,
        process_tree_isolation: legacy.system_audio,
        min_os_version: Some("Windows build 20348".into()),
        reason: legacy.reason,
    }
}

pub fn verify_host(host: &HostIdentity) -> Result<(), HelperError> {
    verify_direct_parent(host.electron_root_pid).map_err(|_| {
        HelperError::invalid(
            "untrusted-parent",
            "The helper is not a direct child of the declared Electron root.",
        )
    })
}

pub async fn sources(
    host: &HostIdentity,
    include_thumbnails: bool,
) -> Result<Vec<Source>, HelperError> {
    // Process proof controls audio availability, not whether video sources can
    // be listed. A transient proof failure therefore stays fail-closed for
    // audio while keeping the picker useful.
    let proof = prove_electron_tree(host.electron_root_pid).ok();
    let mut sources = legacy::sources(proof).map_err(|_| {
        HelperError::retryable(
            "source-enumeration-failed",
            "Windows could not list shareable sources.",
        )
    })?;
    if !include_thumbnails {
        for source in &mut sources {
            source.thumbnail_data_url = None;
        }
    }
    Ok(sources
        .into_iter()
        .map(|source| Source {
            id: source.id,
            kind: map_kind(source.kind),
            label: source.label,
            application_label: source.application_label,
            audio_available: source.audio_available,
            audio_unavailable_reason: source.audio_unavailable_reason,
            thumbnail_data_url: source.thumbnail_data_url,
        })
        .collect())
}

pub async fn prepare(
    host: &HostIdentity,
    source_id: &str,
    include_audio: bool,
    settings: CaptureSettings,
    events: CaptureEventSender,
) -> Result<PreparedCapture, HelperError> {
    let tracker = WebViewProcessTracker::start_electron(host.electron_root_pid).map_err(|_| {
        HelperError::invalid(
            "audio-isolation-unavailable",
            "The Electron process tree could not be verified.",
        )
    })?;
    let (audio_failure_tx, mut audio_failure_rx) = mpsc::unbounded_channel();
    let (termination_tx, mut termination_rx) = mpsc::unbounded_channel();
    let (pause_tx, mut pause_rx) = mpsc::unbounded_channel();
    let events_for_audio = events.clone();
    tokio::spawn(async move {
        if audio_failure_rx.recv().await.is_some() {
            let _ = events_for_audio.send(CaptureEvent::IsolationLost {
                code: "windows-topology-proof-lost".into(),
                message: "Windows process topology changed; isolated audio stopped while video continues."
                    .into(),
            });
        }
    });
    let events_for_end = events.clone();
    tokio::spawn(async move {
        if termination_rx.recv().await.is_some() {
            let _ = events_for_end.send(CaptureEvent::Ended {
                code: "source-ended".into(),
                message: "The selected Windows source stopped sharing.".into(),
            });
        }
    });
    tokio::spawn(async move {
        while let Some(paused) = pause_rx.recv().await {
            let _ = events.send(CaptureEvent::Paused(paused));
        }
    });
    let inner = legacy::pick_source(
        include_audio,
        ScreenShareSettings::from_capture(settings),
        Some(source_id),
        tracker,
        audio_failure_tx,
        termination_tx,
        pause_tx,
    )
    .await
    .map_err(|_| {
        HelperError::retryable(
            "source-prepare-failed",
            "Windows could not prepare the selected capture source.",
        )
    })?;
    let audio_requested = inner.includes_audio();
    let source_kind = map_kind(inner.source_kind);
    let metadata = PreparedMetadata {
        source_label: inner.source_label.clone(),
        source_kind,
        width: inner.width,
        height: inner.height,
        audio_requested,
        audio_isolation_mode: if !audio_requested {
            AudioIsolationMode::Disabled
        } else if source_kind == SourceKind::Display {
            AudioIsolationMode::ExcludeBakbakProcessTree
        } else {
            AudioIsolationMode::IncludeSelectedProcessTree
        },
        audio_unavailable_reason: include_audio
            .then(|| inner.audio_unavailable_reason().map(str::to_string))
            .flatten(),
    };
    Ok(PreparedCapture { inner, metadata })
}

pub async fn start_capture(
    prepared: PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
) -> Result<(CaptureSession, bool, Option<String>), HelperError> {
    legacy::start_capture(prepared.inner, video_source, audio_source)
        .await
        .map(|(inner, audio, reason)| (CaptureSession { inner }, audio, reason))
        .map_err(|_| {
            HelperError::retryable(
                "capture-start-failed",
                "Windows could not start the selected native capture source.",
            )
        })
}

fn map_kind(kind: ScreenShareSourceKind) -> SourceKind {
    match kind {
        ScreenShareSourceKind::Display => SourceKind::Display,
        ScreenShareSourceKind::Application => SourceKind::Application,
    }
}
