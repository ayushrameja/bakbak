#[cfg(any(target_os = "macos", target_os = "windows"))]
mod native {
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    };

    use livekit::{
        Room, RoomEvent, RoomOptions,
        options::{AudioEncoding, TrackPublishOptions, VideoCodec, VideoEncoding},
        prelude::TrackSid,
        track::{LocalAudioTrack, LocalTrack, LocalVideoTrack, TrackSource},
        webrtc::{
            audio_source::native::NativeAudioSource,
            prelude::{AudioSourceOptions, RtcAudioSource, RtcVideoSource, VideoResolution},
            video_source::native::NativeVideoSource,
        },
    };
    use tokio::{sync::Mutex, task::JoinHandle};
    use uuid::Uuid;

    use crate::{
        model::{
            AudioIsolationMode, CaptureSettings, Diagnostics, HelperError, LifecyclePayload,
            LifecycleState, StartPayload, StartResult, UpdatePayload, UpdateResult,
        },
        platform::{self, CaptureEvent},
        policy::{HostIdentity, PublishedAudioState},
        protocol::{Outbound, lifecycle},
        redaction::sanitize_external_error,
    };

    pub struct PublisherSession {
        result: StartResult,
        inner: Arc<Mutex<PublisherInner>>,
        monitor: JoinHandle<()>,
        finished: Arc<AtomicBool>,
    }

    struct PublisherInner {
        room: Room,
        capture: Option<platform::CaptureSession>,
        video_track: LocalVideoTrack,
        video_track_sid: TrackSid,
        audio_track: Option<LocalAudioTrack>,
        audio_track_sid: Option<TrackSid>,
        audio_state: PublishedAudioState,
        settings: CaptureSettings,
        paused: bool,
    }

    impl PublisherSession {
        pub async fn start(
            host: &HostIdentity,
            input: StartPayload,
            outbound: tokio::sync::mpsc::UnboundedSender<Outbound>,
        ) -> Result<Self, HelperError> {
            let (event_sender, mut event_receiver) = tokio::sync::mpsc::unbounded_channel();
            let prepared = platform::prepare(
                host,
                &input.source_id,
                input.include_audio,
                input.settings,
                event_sender.clone(),
            )
            .await?;
            let metadata = prepared.metadata();
            let mut room_options = RoomOptions::default();
            room_options.auto_subscribe = false;
            let (room, mut room_events) =
                Room::connect(&input.server_url, input.token.expose(), room_options)
                    .await
                    .map_err(|error| {
                        HelperError::retryable(
                            "publisher-connect-failed",
                            format!(
                                "The native screen publisher could not connect: {}",
                                sanitize_external_error(error.to_string())
                            ),
                        )
                    })?;
            let event_sender_for_room = event_sender.clone();
            tokio::spawn(async move {
                while let Some(event) = room_events.recv().await {
                    if matches!(event, RoomEvent::Disconnected { .. }) {
                        let _ = event_sender_for_room.send(CaptureEvent::Ended {
                            code: "publisher-disconnected".into(),
                            message: "The screen-share connection ended unexpectedly.".into(),
                        });
                        break;
                    }
                }
            });

            let video_source = NativeVideoSource::new(
                VideoResolution {
                    width: metadata.width,
                    height: metadata.height,
                },
                true,
            );
            let video_track = LocalVideoTrack::create_video_track(
                "bakbak-screen",
                RtcVideoSource::Native(video_source.clone()),
            );
            let requested_audio_source = prepared
                .includes_audio()
                .then(|| NativeAudioSource::new(AudioSourceOptions::default(), 48_000, 2, 200));
            let (mut capture, audio_captured, capture_audio_reason) = match platform::start_capture(
                prepared,
                video_source,
                requested_audio_source.clone(),
            )
            .await
            {
                Ok(value) => value,
                Err(error) => {
                    let _ = room.close().await;
                    return Err(error);
                }
            };
            let video_track_sid =
                match publish_video(&room, video_track.clone(), input.settings).await {
                    Ok(sid) => sid,
                    Err(error) => {
                        capture.stop().await;
                        let _ = room.close().await;
                        return Err(error);
                    }
                };

            let mut audio_track = None;
            let mut audio_track_sid = None;
            let mut audio_unavailable_reason = metadata
                .audio_unavailable_reason
                .clone()
                .or(capture_audio_reason);
            if audio_captured && let Some(source) = requested_audio_source {
                let track = LocalAudioTrack::create_audio_track(
                    "bakbak-screen-audio",
                    RtcAudioSource::Native(source),
                );
                match room
                    .local_participant()
                    .publish_track(
                        LocalTrack::Audio(track.clone()),
                        TrackPublishOptions {
                            source: TrackSource::ScreenshareAudio,
                            audio_encoding: Some(AudioEncoding {
                                max_bitrate: 128_000,
                            }),
                            dtx: false,
                            ..Default::default()
                        },
                    )
                    .await
                {
                    Ok(publication) => {
                        audio_track_sid = Some(publication.sid());
                        audio_track = Some(track);
                        audio_unavailable_reason = None;
                    }
                    Err(_) => {
                        // Fail closed: once publication fails, stop native audio
                        // forwarding immediately instead of leaving an invisible
                        // capture running behind the video publication.
                        capture.stop_audio().await;
                        audio_unavailable_reason = Some(
                            "The isolated audio track could not be published; video is still sharing."
                                .into(),
                        );
                    }
                }
            }

            let session_id = Uuid::new_v4().to_string();
            let audio_published = audio_track_sid.is_some();
            let result = StartResult {
                session_id: session_id.clone(),
                source_label: metadata.source_label,
                source_kind: metadata.source_kind,
                audio_published,
                audio_unavailable_reason,
                settings: input.settings,
                diagnostics: Diagnostics {
                    capture_backend: platform::capture_backend().into(),
                    audio_isolation_mode: if audio_published {
                        metadata.audio_isolation_mode
                    } else {
                        AudioIsolationMode::Disabled
                    },
                },
            };
            let inner = Arc::new(Mutex::new(PublisherInner {
                room,
                capture: Some(capture),
                video_track,
                video_track_sid,
                audio_track,
                audio_track_sid,
                audio_state: if audio_published {
                    PublishedAudioState::Published
                } else {
                    PublishedAudioState::Disabled
                },
                settings: input.settings,
                paused: false,
            }));
            let inner_for_monitor = inner.clone();
            let session_for_monitor = session_id.clone();
            let finished = Arc::new(AtomicBool::new(false));
            let finished_for_monitor = finished.clone();
            let monitor = tokio::spawn(async move {
                while let Some(event) = event_receiver.recv().await {
                    match event {
                        CaptureEvent::IsolationLost { code, message } => {
                            let mut state = inner_for_monitor.lock().await;
                            if !state.audio_state.isolation_lost() {
                                continue;
                            }
                            if let Some(capture) = state.capture.as_mut() {
                                capture.stop_audio().await;
                            }
                            if let Some(track_sid) = state.audio_track_sid.take() {
                                let _ = state
                                    .room
                                    .local_participant()
                                    .unpublish_track(&track_sid)
                                    .await;
                            }
                            state.audio_track = None;
                            let _ = outbound.send(lifecycle(LifecyclePayload {
                                session_id: Some(session_for_monitor.clone()),
                                state: LifecycleState::AudioDowngraded,
                                reason_code: Some(code),
                                message: Some(message),
                                audio_published: Some(false),
                            }));
                        }
                        CaptureEvent::Paused(paused) => {
                            let mut state = inner_for_monitor.lock().await;
                            state.paused = paused;
                            if paused {
                                state.video_track.mute();
                            } else {
                                state.video_track.unmute();
                            }
                        }
                        CaptureEvent::Ended { code, message } => {
                            let mut state = inner_for_monitor.lock().await;
                            if let Some(capture) = state.capture.take() {
                                capture.stop().await;
                            }
                            let _ = state.room.close().await;
                            let _ = outbound.send(lifecycle(LifecyclePayload {
                                session_id: Some(session_for_monitor.clone()),
                                state: LifecycleState::Failed,
                                reason_code: Some(code),
                                message: Some(message),
                                audio_published: Some(false),
                            }));
                            finished_for_monitor.store(true, Ordering::Release);
                            break;
                        }
                    }
                }
            });
            Ok(Self {
                result,
                inner,
                monitor,
                finished,
            })
        }

        pub fn result(&self) -> &StartResult {
            &self.result
        }

        pub fn session_id(&self) -> String {
            self.result.session_id.clone()
        }

        pub fn is_finished(&self) -> bool {
            self.finished.load(Ordering::Acquire)
        }

        pub async fn update(&mut self, input: UpdatePayload) -> Result<UpdateResult, HelperError> {
            if input.session_id != self.result.session_id {
                return Err(HelperError::invalid(
                    "stale-session",
                    "The requested screen-share session is no longer active.",
                ));
            }
            let mut state = self.inner.lock().await;
            if let Some(settings) = input.settings {
                let settings = settings.validate()?;
                if let Some(capture) = state.capture.as_ref() {
                    capture.update_settings(settings).await?;
                }
                let previous_sid = state.video_track_sid.clone();
                let _ = state
                    .room
                    .local_participant()
                    .unpublish_track(&previous_sid)
                    .await;
                state.video_track_sid =
                    publish_video(&state.room, state.video_track.clone(), settings).await?;
                state.settings = settings;
                self.result.settings = settings;
            }
            if let Some(paused) = input.paused {
                if paused {
                    state.video_track.mute();
                } else {
                    state.video_track.unmute();
                }
                state.paused = paused;
            }
            Ok(UpdateResult {
                session_id: self.result.session_id.clone(),
                settings: state.settings,
                paused: state.paused,
            })
        }

        pub async fn stop(self) {
            self.monitor.abort();
            let mut state = self.inner.lock().await;
            if let Some(capture) = state.capture.take() {
                capture.stop().await;
            }
            let _ = state.room.close().await;
        }
    }

    async fn publish_video(
        room: &Room,
        track: LocalVideoTrack,
        settings: CaptureSettings,
    ) -> Result<TrackSid, HelperError> {
        room.local_participant()
            .publish_track(
                LocalTrack::Video(track),
                TrackPublishOptions {
                    source: TrackSource::Screenshare,
                    video_codec: VideoCodec::H264,
                    video_encoding: Some(VideoEncoding {
                        max_bitrate: settings.max_bitrate,
                        max_framerate: settings.frame_rate as f64,
                    }),
                    simulcast: true,
                    ..Default::default()
                },
            )
            .await
            .map(|publication| publication.sid())
            .map_err(|error| {
                HelperError::retryable(
                    "video-publish-failed",
                    format!(
                        "The selected screen could not be published: {}",
                        sanitize_external_error(error.to_string())
                    ),
                )
            })
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub use native::PublisherSession;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub struct PublisherSession;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl PublisherSession {
    pub async fn start(
        _host: &crate::policy::HostIdentity,
        _input: crate::model::StartPayload,
        _outbound: tokio::sync::mpsc::UnboundedSender<crate::protocol::Outbound>,
    ) -> Result<Self, crate::model::HelperError> {
        Err(crate::platform::unavailable())
    }

    pub fn result(&self) -> &crate::model::StartResult {
        unreachable!()
    }

    pub fn session_id(&self) -> String {
        String::new()
    }

    pub fn is_finished(&self) -> bool {
        false
    }

    pub async fn update(
        &mut self,
        _input: crate::model::UpdatePayload,
    ) -> Result<crate::model::UpdateResult, crate::model::HelperError> {
        Err(crate::platform::unavailable())
    }

    pub async fn stop(self) {}
}
