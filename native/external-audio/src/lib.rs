use std::{
    collections::VecDeque,
    fmt,
    str::FromStr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    },
};

use cpal::{
    Device, DeviceId, FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig,
    SupportedStreamConfig,
    traits::{DeviceTrait, HostTrait, StreamTrait},
};
use serde::{
    Deserialize, Deserializer, Serialize,
    de::{self, SeqAccess, Visitor},
};

pub const MIX_SAMPLE_RATE: u32 = 48_000;
pub const MAX_SOUND_SAMPLES: usize = MIX_SAMPLE_RATE as usize * 5;
pub const MAX_SETUP_RECORDING_SAMPLES: usize = MIX_SAMPLE_RATE as usize * 2;
const MAX_LIVE_MICROPHONE_SAMPLES: usize = MIX_SAMPLE_RATE as usize * 40 / 1_000;
const MAX_DEVICE_ID_BYTES: usize = 1_024;
const STOP_FADE_SAMPLES: usize = MIX_SAMPLE_RATE as usize / 200;
const NATURAL_FADE_SAMPLES: usize = MIX_SAMPLE_RATE as usize / 50;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub label: String,
    pub kind: DeviceKind,
    pub is_default: bool,
    pub cable_kind: Option<CableKind>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceKind {
    Input,
    Output,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CableKind {
    #[serde(rename = "blackhole-2ch")]
    Blackhole2ch,
    VbCable,
    Unknown,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub inputs: Vec<AudioDevice>,
    pub outputs: Vec<AudioDevice>,
    pub recommended_cable_input_id: Option<String>,
    pub recommended_cable_output_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionConfig {
    #[serde(deserialize_with = "deserialize_device_id")]
    pub microphone_device_id: String,
    #[serde(deserialize_with = "deserialize_device_id")]
    pub cable_output_device_id: String,
    #[serde(default, deserialize_with = "deserialize_optional_device_id")]
    pub monitor_output_device_id: Option<String>,
    pub microphone_gain: f32,
    pub soundboard_gain: f32,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetupTestConfig {
    #[serde(deserialize_with = "deserialize_device_id")]
    pub microphone_device_id: String,
    #[serde(default, deserialize_with = "deserialize_optional_device_id")]
    pub monitor_output_device_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetupRecording {
    pub sample_rate: u32,
    #[serde(deserialize_with = "deserialize_setup_samples")]
    pub samples: Vec<f32>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Idle,
    Starting,
    Testing,
    Live,
    Stopping,
    Suspended,
    Error,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub status: SessionStatus,
    pub config: Option<SessionConfig>,
    pub microphone_muted: bool,
    pub active_sound_id: Option<String>,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

impl Default for SessionState {
    fn default() -> Self {
        Self {
            status: SessionStatus::Idle,
            config: None,
            microphone_muted: false,
            active_sound_id: None,
            error_code: None,
            message: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Levels {
    pub microphone: f32,
    pub output: f32,
    pub clipping: bool,
}

pub struct ExternalAudioEngine {
    host: cpal::Host,
    shared: Arc<Shared>,
    streams: Mutex<Option<ActiveStreams>>,
    lifecycle: Mutex<()>,
}

struct ActiveStreams {
    input: Stream,
    cable: Option<Stream>,
    monitor: Option<Stream>,
}

struct Shared {
    state: Mutex<SessionState>,
    live_microphone: Mutex<VecDeque<f32>>,
    setup_recording: Mutex<VecDeque<f32>>,
    sound: Mutex<SoundSlot>,
    running: AtomicBool,
    setup_testing: AtomicBool,
    setup_monitor_enabled: AtomicBool,
    microphone_gain: AtomicU32,
    soundboard_gain: AtomicU32,
    microphone_muted: AtomicBool,
    microphone_peak: AtomicU32,
    output_peak: AtomicU32,
    clipping: AtomicBool,
    sound_generation: AtomicU64,
    feedback_generation: AtomicU64,
}

#[derive(Default)]
struct SoundSlot {
    generation: u64,
    id: Option<String>,
    samples: Arc<[f32]>,
}

impl Default for ExternalAudioEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl ExternalAudioEngine {
    pub fn new() -> Self {
        Self {
            host: cpal::default_host(),
            shared: Arc::new(Shared {
                state: Mutex::new(SessionState::default()),
                live_microphone: Mutex::new(VecDeque::with_capacity(MAX_LIVE_MICROPHONE_SAMPLES)),
                setup_recording: Mutex::new(VecDeque::with_capacity(MAX_SETUP_RECORDING_SAMPLES)),
                sound: Mutex::new(SoundSlot::default()),
                running: AtomicBool::new(false),
                setup_testing: AtomicBool::new(false),
                setup_monitor_enabled: AtomicBool::new(false),
                microphone_gain: AtomicU32::new(1.0f32.to_bits()),
                soundboard_gain: AtomicU32::new(0.7f32.to_bits()),
                microphone_muted: AtomicBool::new(false),
                microphone_peak: AtomicU32::new(0.0f32.to_bits()),
                output_peak: AtomicU32::new(0.0f32.to_bits()),
                clipping: AtomicBool::new(false),
                sound_generation: AtomicU64::new(0),
                feedback_generation: AtomicU64::new(0),
            }),
            streams: Mutex::new(None),
            lifecycle: Mutex::new(()),
        }
    }

    pub fn list_devices(&self) -> Result<DeviceSnapshot, String> {
        let default_input = self
            .host
            .default_input_device()
            .and_then(|device| device.id().ok())
            .map(|id| id.to_string());
        let default_output = self
            .host
            .default_output_device()
            .and_then(|device| device.id().ok())
            .map(|id| id.to_string());
        let mut inputs = Vec::new();
        let mut outputs = Vec::new();
        for device in self
            .host
            .devices()
            .map_err(|_| "Bakbak could not enumerate native audio devices.".to_string())?
        {
            let id = device
                .id()
                .map_err(|_| "An audio device has no stable identifier.".to_string())?
                .to_string();
            let label = device.to_string();
            let cable_kind = detect_cable(&label);
            if device
                .supported_input_configs()
                .is_ok_and(|mut configs| configs.next().is_some())
            {
                inputs.push(AudioDevice {
                    id: id.clone(),
                    label: label.clone(),
                    kind: DeviceKind::Input,
                    is_default: default_input.as_deref() == Some(id.as_str()),
                    cable_kind,
                });
            }
            if device
                .supported_output_configs()
                .is_ok_and(|mut configs| configs.next().is_some())
            {
                let is_default = default_output.as_deref() == Some(id.as_str());
                outputs.push(AudioDevice {
                    id,
                    label,
                    kind: DeviceKind::Output,
                    is_default,
                    cable_kind,
                });
            }
        }
        inputs.sort_by_key(|device| (!device.is_default, device.label.to_lowercase()));
        outputs.sort_by_key(|device| (!device.is_default, device.label.to_lowercase()));
        let (recommended_cable_input_id, recommended_cable_output_id) =
            recommended_cable_pair(&inputs, &outputs);
        Ok(DeviceSnapshot {
            inputs,
            outputs,
            recommended_cable_input_id,
            recommended_cable_output_id,
        })
    }

    pub fn state(&self) -> SessionState {
        self.shared
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn levels(&self) -> Levels {
        Levels {
            microphone: f32::from_bits(self.shared.microphone_peak.swap(0, Ordering::Relaxed)),
            output: f32::from_bits(self.shared.output_peak.swap(0, Ordering::Relaxed)),
            clipping: self.shared.clipping.swap(false, Ordering::Relaxed),
        }
    }

    pub fn start(&self, config: SessionConfig) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        validate_config(&config)?;
        validate_device_roles(&config, &self.list_devices()?)?;
        self.prepare_restart_after_terminal_state();
        if self.shared.running.swap(true, Ordering::AcqRel) {
            return Err("External Soundboard is already running.".into());
        }
        self.set_state(SessionState {
            status: SessionStatus::Starting,
            config: Some(config.clone()),
            ..SessionState::default()
        });
        self.shared
            .microphone_gain
            .store(config.microphone_gain.to_bits(), Ordering::Relaxed);
        self.shared
            .soundboard_gain
            .store(config.soundboard_gain.to_bits(), Ordering::Relaxed);
        self.shared.microphone_muted.store(false, Ordering::Relaxed);

        let result = self.build_streams(&config).and_then(|streams| {
            streams.input.play().map_err(stream_error)?;
            streams
                .cable
                .as_ref()
                .ok_or_else(|| "The virtual cable output was not opened.".to_string())?
                .play()
                .map_err(stream_error)?;
            if let Some(monitor) = &streams.monitor {
                monitor.play().map_err(stream_error)?;
            }
            *self
                .streams
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(streams);
            Ok(())
        });
        if let Err(message) = result {
            self.shared.running.store(false, Ordering::Release);
            self.shared.feedback_generation.store(0, Ordering::Release);
            self.fail("device-start-failed", &message);
            return Err(message);
        }
        self.complete_stream_start(
            SessionState {
                status: SessionStatus::Live,
                config: Some(config),
                ..SessionState::default()
            },
            "An external audio device stopped while Bakbak was starting.",
        )
    }

    pub fn start_setup_test(&self, config: SetupTestConfig) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        validate_setup_test_config(&config, &self.list_devices()?)?;
        let status = self.state().status;
        if matches!(
            status,
            SessionStatus::Starting
                | SessionStatus::Testing
                | SessionStatus::Live
                | SessionStatus::Stopping
        ) {
            return Err("Stop the current external-audio session before testing devices.".into());
        }
        self.prepare_restart_after_terminal_state();
        if self.shared.running.swap(true, Ordering::AcqRel) {
            return Err("Stop the current external-audio session before testing devices.".into());
        }
        self.clear_audio_buffers();
        self.shared.setup_testing.store(true, Ordering::Release);
        self.shared
            .setup_monitor_enabled
            .store(config.monitor_output_device_id.is_some(), Ordering::Release);
        self.shared
            .microphone_gain
            .store(1.0f32.to_bits(), Ordering::Relaxed);
        self.shared
            .soundboard_gain
            .store(0.7f32.to_bits(), Ordering::Relaxed);
        self.shared.microphone_muted.store(false, Ordering::Relaxed);
        self.set_state(SessionState {
            status: SessionStatus::Starting,
            ..SessionState::default()
        });

        let result = self.build_setup_test_streams(&config).and_then(|streams| {
            streams.input.play().map_err(stream_error)?;
            if let Some(monitor) = &streams.monitor {
                monitor.play().map_err(stream_error)?;
            }
            *self
                .streams
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(streams);
            Ok(())
        });
        if let Err(message) = result {
            self.shared.running.store(false, Ordering::Release);
            self.shared.feedback_generation.store(0, Ordering::Release);
            self.shared.setup_testing.store(false, Ordering::Release);
            self.shared
                .setup_monitor_enabled
                .store(false, Ordering::Release);
            self.fail("setup-device-start-failed", &message);
            return Err(message);
        }
        self.complete_stream_start(
            SessionState {
                status: SessionStatus::Testing,
                ..SessionState::default()
            },
            "An external audio device stopped while Bakbak was testing it.",
        )
    }

    pub fn clear_setup_recording(&self) -> Result<(), String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.ensure_setup_testing()?;
        self.shared
            .setup_recording
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
        Ok(())
    }

    pub fn capture_setup_recording(&self) -> Result<SetupRecording, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.ensure_setup_testing()?;
        let samples = self
            .shared
            .setup_recording
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
            .copied()
            .take(MAX_SETUP_RECORDING_SAMPLES)
            .collect();
        Ok(SetupRecording {
            sample_rate: MIX_SAMPLE_RATE,
            samples,
        })
    }

    pub fn play_setup_tone(&self) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.ensure_setup_monitor()?;
        let sample_count = MIX_SAMPLE_RATE as usize * 350 / 1_000;
        let samples = (0..sample_count)
            .map(|index| {
                let phase = index as f32 * 660.0 * std::f32::consts::TAU / MIX_SAMPLE_RATE as f32;
                phase.sin() * 0.22
            })
            .collect();
        self.replace_sound("__bakbak_setup_tone__".into(), samples)
    }

    pub fn play_setup_recording(&self, recording: SetupRecording) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.ensure_setup_monitor()?;
        validate_setup_recording(&recording)?;
        self.replace_sound("__bakbak_setup_recording__".into(), recording.samples)
    }

    pub fn stop_setup_test(&self) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if !matches!(
            self.state().status,
            SessionStatus::Starting | SessionStatus::Testing | SessionStatus::Error
        ) || !self.shared.setup_testing.load(Ordering::Acquire)
        {
            return Err("No external-audio setup test is running.".into());
        }
        Ok(self.stop_unlocked())
    }

    pub fn update(
        &self,
        microphone_muted: Option<bool>,
        microphone_gain: Option<f32>,
        soundboard_gain: Option<f32>,
    ) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.state().status != SessionStatus::Live {
            return Err("External Soundboard is not live.".into());
        }
        if let Some(value) = microphone_gain {
            validate_gain(value)?;
            self.shared
                .microphone_gain
                .store(value.to_bits(), Ordering::Relaxed);
        }
        if let Some(value) = soundboard_gain {
            validate_gain(value)?;
            self.shared
                .soundboard_gain
                .store(value.to_bits(), Ordering::Relaxed);
        }
        if let Some(value) = microphone_muted {
            self.shared.microphone_muted.store(value, Ordering::Relaxed);
        }
        let mut state = self
            .shared
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.microphone_muted = self.shared.microphone_muted.load(Ordering::Relaxed);
        if let Some(config) = state.config.as_mut() {
            config.microphone_gain =
                f32::from_bits(self.shared.microphone_gain.load(Ordering::Relaxed));
            config.soundboard_gain =
                f32::from_bits(self.shared.soundboard_gain.load(Ordering::Relaxed));
        }
        Ok(state.clone())
    }

    /// A quiet 24 ms selection tick, consumed exclusively by the headphone
    /// callback. It never replaces the selected sound or reaches the cable.
    pub fn selection_feedback(&self) {
        if self.shared.running.load(Ordering::Acquire)
            && !self.shared.setup_testing.load(Ordering::Acquire)
        {
            self.shared
                .feedback_generation
                .fetch_add(1, Ordering::AcqRel);
        }
    }

    pub fn play_sound(&self, sound_id: String, samples: Vec<f32>) -> Result<SessionState, String> {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if self.state().status != SessionStatus::Live {
            return Err("External Soundboard is not live.".into());
        }
        if sound_id.is_empty() || sound_id.len() > 128 || sound_id.contains(['\n', '\r']) {
            return Err("That sound identifier is invalid.".into());
        }
        if samples.is_empty() || samples.len() > MAX_SOUND_SAMPLES {
            return Err("External sounds must be between 0 and 5 seconds.".into());
        }
        self.replace_sound(sound_id, samples)
    }

    fn replace_sound(&self, sound_id: String, samples: Vec<f32>) -> Result<SessionState, String> {
        let mut samples = samples
            .into_iter()
            .map(|sample| {
                if sample.is_finite() {
                    sample.clamp(-1.0, 1.0)
                } else {
                    0.0
                }
            })
            .collect::<Vec<_>>();
        apply_declick_envelope(&mut samples);
        {
            let mut sound = self
                .shared
                .sound
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            sound.generation = self.shared.sound_generation.fetch_add(1, Ordering::AcqRel) + 1;
            sound.id = Some(sound_id.clone());
            sound.samples = Arc::from(samples);
        }
        let mut state = self
            .shared
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.active_sound_id = Some(sound_id);
        Ok(state.clone())
    }

    pub fn stop_sound(&self) -> SessionState {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.stop_sound_unlocked()
    }

    fn stop_sound_unlocked(&self) -> SessionState {
        {
            let mut sound = self
                .shared
                .sound
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            sound.generation = self.shared.sound_generation.fetch_add(1, Ordering::AcqRel) + 1;
            sound.id = None;
            sound.samples = Arc::from([]);
        }
        let mut state = self
            .shared
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.active_sound_id = None;
        state.clone()
    }

    pub fn release_after_failure(&self) -> SessionState {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut state = self.state();
        if state.status != SessionStatus::Error {
            return state;
        }
        self.shared.running.store(false, Ordering::Release);
        self.shared.feedback_generation.store(0, Ordering::Release);
        self.shared.setup_testing.store(false, Ordering::Release);
        self.shared
            .setup_monitor_enabled
            .store(false, Ordering::Release);
        self.release_streams();
        self.clear_audio_buffers();
        state.microphone_muted = true;
        state.active_sound_id = None;
        self.set_state(state.clone());
        state
    }

    pub fn suspend(&self) -> SessionState {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if !self.shared.running.load(Ordering::Acquire) {
            return self.state();
        }
        self.release_streams();
        self.shared.running.store(false, Ordering::Release);
        self.shared.feedback_generation.store(0, Ordering::Release);
        self.shared.setup_testing.store(false, Ordering::Release);
        self.shared
            .setup_monitor_enabled
            .store(false, Ordering::Release);
        self.stop_sound_unlocked();
        self.clear_microphone_buffers();
        let mut state = self.state();
        state.status = SessionStatus::Suspended;
        state.message =
            Some("External Soundboard stopped after sleep. Start it again when ready.".into());
        self.set_state(state.clone());
        state
    }

    pub fn stop(&self) -> SessionState {
        let _lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        self.stop_unlocked()
    }

    fn stop_unlocked(&self) -> SessionState {
        let existing = self.state();
        if existing.status == SessionStatus::Idle {
            return existing;
        }
        let mut stopping = existing;
        stopping.status = SessionStatus::Stopping;
        self.set_state(stopping);
        self.shared.running.store(false, Ordering::Release);
        self.shared.feedback_generation.store(0, Ordering::Release);
        self.shared.setup_testing.store(false, Ordering::Release);
        self.shared
            .setup_monitor_enabled
            .store(false, Ordering::Release);
        self.release_streams();
        self.stop_sound_unlocked();
        self.clear_microphone_buffers();
        self.set_state(SessionState::default());
        self.state()
    }

    fn build_streams(&self, config: &SessionConfig) -> Result<ActiveStreams, String> {
        let microphone = self.device(&config.microphone_device_id)?;
        let cable = self.device(&config.cable_output_device_id)?;
        let monitor = config
            .monitor_output_device_id
            .as_deref()
            .map(|id| self.device(id))
            .transpose()?;
        let input_config = microphone.default_input_config().map_err(config_error)?;
        let cable_config = cable.default_output_config().map_err(config_error)?;
        let monitor_config = monitor
            .as_ref()
            .map(DeviceTrait::default_output_config)
            .transpose()
            .map_err(config_error)?;
        let input = build_input_stream(microphone, input_config, self.shared.clone())?;
        let cable_stream =
            build_output_stream(cable, cable_config, self.shared.clone(), OutputRole::Cable)?;
        let monitor_stream = monitor
            .zip(monitor_config)
            .map(|(device, config)| {
                build_output_stream(device, config, self.shared.clone(), OutputRole::Monitor)
            })
            .transpose()?;
        Ok(ActiveStreams {
            input,
            cable: Some(cable_stream),
            monitor: monitor_stream,
        })
    }

    fn build_setup_test_streams(&self, config: &SetupTestConfig) -> Result<ActiveStreams, String> {
        let microphone = self.device(&config.microphone_device_id)?;
        let monitor = config
            .monitor_output_device_id
            .as_deref()
            .map(|id| self.device(id))
            .transpose()?;
        let input_config = microphone.default_input_config().map_err(config_error)?;
        let monitor_config = monitor
            .as_ref()
            .map(DeviceTrait::default_output_config)
            .transpose()
            .map_err(config_error)?;
        let input = build_input_stream(microphone, input_config, self.shared.clone())?;
        let monitor = monitor
            .zip(monitor_config)
            .map(|(device, config)| {
                build_output_stream(device, config, self.shared.clone(), OutputRole::Monitor)
            })
            .transpose()?;
        Ok(ActiveStreams {
            input,
            cable: None,
            monitor,
        })
    }

    fn device(&self, value: &str) -> Result<Device, String> {
        let id = DeviceId::from_str(value)
            .map_err(|_| "That audio device ID is invalid.".to_string())?;
        self.host
            .device_by_id(&id)
            .ok_or_else(|| "That audio device is no longer connected.".to_string())
    }

    fn release_streams(&self) {
        self.streams
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
    }

    fn complete_stream_start(
        &self,
        next_state: SessionState,
        fallback_message: &str,
    ) -> Result<SessionState, String> {
        let result = {
            let mut state = self
                .shared
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if self.shared.running.load(Ordering::Acquire) {
                *state = next_state;
                Ok(state.clone())
            } else {
                Err(state
                    .message
                    .clone()
                    .unwrap_or_else(|| fallback_message.to_string()))
            }
        };
        if result.is_err() {
            self.release_streams();
        }
        result
    }

    fn fail(&self, code: &str, message: &str) {
        self.shared.running.store(false, Ordering::Release);
        self.shared.feedback_generation.store(0, Ordering::Release);
        self.set_state(SessionState {
            status: SessionStatus::Error,
            config: self.state().config,
            microphone_muted: true,
            active_sound_id: None,
            error_code: Some(code.into()),
            message: Some(message.into()),
        });
    }

    fn ensure_setup_testing(&self) -> Result<(), String> {
        if self.state().status == SessionStatus::Testing
            && self.shared.setup_testing.load(Ordering::Acquire)
        {
            Ok(())
        } else {
            Err("Start the setup test before recording your microphone.".into())
        }
    }

    fn ensure_setup_monitor(&self) -> Result<(), String> {
        self.ensure_setup_testing()?;
        if self.shared.setup_monitor_enabled.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err("Choose a headphone output to hear setup tests.".into())
        }
    }

    fn clear_audio_buffers(&self) {
        self.clear_microphone_buffers();
        let mut sound = self
            .shared
            .sound
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        sound.generation = self.shared.sound_generation.fetch_add(1, Ordering::AcqRel) + 1;
        sound.id = None;
        sound.samples = Arc::from([]);
    }

    fn clear_microphone_buffers(&self) {
        self.shared
            .live_microphone
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
        self.shared
            .setup_recording
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }

    fn prepare_restart_after_terminal_state(&self) {
        if matches!(
            self.state().status,
            SessionStatus::Error | SessionStatus::Suspended
        ) {
            self.shared.running.store(false, Ordering::Release);
            self.shared.feedback_generation.store(0, Ordering::Release);
            self.shared.setup_testing.store(false, Ordering::Release);
            self.shared
                .setup_monitor_enabled
                .store(false, Ordering::Release);
            self.release_streams();
            self.clear_audio_buffers();
        }
    }

    fn set_state(&self, state: SessionState) {
        *self
            .shared
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = state;
    }
}

impl Drop for ExternalAudioEngine {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Clone, Copy)]
enum OutputRole {
    Cable,
    Monitor,
}

struct SoundCursor {
    generation: u64,
    samples: Arc<[f32]>,
    index: usize,
    phase: u64,
    last_sample: f32,
    stop_fade_remaining: usize,
}

impl SoundCursor {
    fn new() -> Self {
        Self {
            generation: u64::MAX,
            samples: Arc::from([]),
            index: 0,
            phase: 0,
            last_sample: 0.0,
            stop_fade_remaining: 0,
        }
    }

    fn next(&mut self, shared: &Shared, output_rate: u32) -> f32 {
        let generation = shared.sound_generation.load(Ordering::Acquire);
        if generation != self.generation {
            self.stop_fade_remaining = if self.last_sample == 0.0 {
                0
            } else {
                STOP_FADE_SAMPLES
            };
            self.generation = generation;
            let slot = shared
                .sound
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            self.samples = if slot.generation == generation {
                slot.samples.clone()
            } else {
                Arc::from([])
            };
            self.index = 0;
            self.phase = 0;
        }
        if self.stop_fade_remaining > 0 {
            let sample =
                self.last_sample * (self.stop_fade_remaining as f32 / STOP_FADE_SAMPLES as f32);
            self.stop_fade_remaining -= 1;
            if self.stop_fade_remaining == 0 {
                self.last_sample = 0.0;
            }
            return sample;
        }
        if self.index >= self.samples.len() {
            self.last_sample = 0.0;
            return 0.0;
        }
        let sample = self.samples[self.index];
        self.last_sample = sample;
        self.phase += MIX_SAMPLE_RATE as u64;
        while self.phase >= output_rate as u64 {
            self.phase -= output_rate as u64;
            self.index += 1;
        }
        sample
    }
}

fn build_input_stream(
    device: Device,
    supported: SupportedStreamConfig,
    shared: Arc<Shared>,
) -> Result<Stream, String> {
    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.into();
    match sample_format {
        SampleFormat::F32 => build_input::<f32>(device, config, shared),
        SampleFormat::I16 => build_input::<i16>(device, config, shared),
        SampleFormat::U16 => build_input::<u16>(device, config, shared),
        _ => Err("The selected microphone sample format is unsupported.".into()),
    }
}

fn build_input<T>(
    device: Device,
    config: StreamConfig,
    shared: Arc<Shared>,
) -> Result<Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = usize::from(config.channels.max(1));
    let input_rate = config.sample_rate;
    let mut phase = 0u64;
    let shared_for_error = shared.clone();
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if !shared.running.load(Ordering::Acquire) {
                    return;
                }
                let (queue, capacity) = active_microphone_buffer(&shared);
                let mut queue = queue
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                let mut peak = 0.0f32;
                for frame in data.chunks(channels) {
                    let mono = frame
                        .iter()
                        .map(|sample| f32::from_sample(*sample))
                        .sum::<f32>()
                        / frame.len().max(1) as f32;
                    peak = peak.max(mono.abs());
                    phase += MIX_SAMPLE_RATE as u64;
                    while phase >= input_rate as u64 {
                        phase -= input_rate as u64;
                        push_bounded(&mut queue, mono, capacity);
                    }
                }
                shared
                    .microphone_peak
                    .store(peak.min(1.0).to_bits(), Ordering::Relaxed);
            },
            move |_| fail_shared(&shared_for_error, "input-device-lost"),
            None,
        )
        .map_err(stream_error)
}

fn build_output_stream(
    device: Device,
    supported: SupportedStreamConfig,
    shared: Arc<Shared>,
    role: OutputRole,
) -> Result<Stream, String> {
    let sample_format = supported.sample_format();
    let config: StreamConfig = supported.into();
    match sample_format {
        SampleFormat::F32 => build_output::<f32>(device, config, shared, role),
        SampleFormat::I16 => build_output::<i16>(device, config, shared, role),
        SampleFormat::U16 => build_output::<u16>(device, config, shared, role),
        _ => Err("The selected output sample format is unsupported.".into()),
    }
}

#[derive(Default)]
struct SelectionFeedback {
    generation: u64,
    frame: u32,
}
impl SelectionFeedback {
    fn next(&mut self, generation: u64, output_rate: u32, role: OutputRole) -> f32 {
        if !matches!(role, OutputRole::Monitor) {
            return 0.0;
        }
        if self.generation != generation {
            self.generation = generation;
            self.frame = 0;
        }
        if generation == 0 {
            return 0.0;
        }
        let time = self.frame as f32 / output_rate as f32;
        if time >= 0.024 {
            return 0.0;
        }
        self.frame += 1;
        let envelope = (time / 0.002).min(1.0) * (1.0 - time / 0.024).powi(2);
        (time * 1_200.0 * std::f32::consts::TAU).sin() * envelope * 0.055
    }
}

fn build_output<T>(
    device: Device,
    config: StreamConfig,
    shared: Arc<Shared>,
    role: OutputRole,
) -> Result<Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = usize::from(config.channels.max(1));
    let output_rate = config.sample_rate;
    let mut sound = SoundCursor::new();
    let mut feedback = SelectionFeedback::default();
    let mut mic_current = 0.0f32;
    let mut mic_phase = 0u64;
    let shared_for_error = shared.clone();
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _| {
                let running = shared.running.load(Ordering::Acquire);
                let mic_gain = if shared.microphone_muted.load(Ordering::Relaxed) {
                    0.0
                } else {
                    f32::from_bits(shared.microphone_gain.load(Ordering::Relaxed))
                };
                let sound_gain = f32::from_bits(shared.soundboard_gain.load(Ordering::Relaxed));
                let mut queue = matches!(role, OutputRole::Cable).then(|| {
                    shared
                        .live_microphone
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner)
                });
                let mut peak = 0.0f32;
                let mut clipped = false;
                for frame in data.chunks_mut(channels) {
                    let sound_sample = if running {
                        sound.next(&shared, output_rate) * sound_gain
                    } else {
                        0.0
                    };
                    let mic_sample = if running && matches!(role, OutputRole::Cable) {
                        mic_phase += MIX_SAMPLE_RATE as u64;
                        while mic_phase >= output_rate as u64 {
                            mic_phase -= output_rate as u64;
                            mic_current = queue
                                .as_mut()
                                .and_then(|queue| queue.pop_front())
                                .unwrap_or(0.0);
                        }
                        mic_current * mic_gain
                    } else {
                        0.0
                    };
                    let tick = if running {
                        feedback.next(
                            shared.feedback_generation.load(Ordering::Acquire),
                            output_rate,
                            role,
                        )
                    } else {
                        0.0
                    };
                    let raw = mic_sample + sound_sample + tick;
                    clipped |= raw.abs() > 1.0;
                    let output = soft_limit(raw);
                    peak = peak.max(output.abs());
                    for sample in frame {
                        *sample = T::from_sample(output);
                    }
                }
                drop(queue);
                if matches!(role, OutputRole::Cable) || shared.setup_testing.load(Ordering::Acquire)
                {
                    shared.output_peak.store(peak.to_bits(), Ordering::Relaxed);
                }
                if matches!(role, OutputRole::Cable) && clipped {
                    shared.clipping.store(true, Ordering::Relaxed);
                }
                if (matches!(role, OutputRole::Cable)
                    || shared.setup_testing.load(Ordering::Acquire))
                    && sound.index >= sound.samples.len()
                    && !sound.samples.is_empty()
                {
                    finish_sound_if_current(&shared, sound.generation);
                }
            },
            move |_| fail_shared(&shared_for_error, "output-device-lost"),
            None,
        )
        .map_err(stream_error)
}

fn finish_sound_if_current(shared: &Shared, generation: u64) {
    if shared.sound_generation.load(Ordering::Acquire) != generation {
        return;
    }
    let mut sound = shared
        .sound
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if sound.generation != generation || sound.samples.is_empty() {
        return;
    }
    sound.id = None;
    sound.samples = Arc::from([]);
    let mut state = shared
        .state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    state.active_sound_id = None;
}

fn fail_shared(shared: &Shared, code: &str) {
    shared.running.store(false, Ordering::Release);
    shared.feedback_generation.store(0, Ordering::Release);
    shared.setup_testing.store(false, Ordering::Release);
    shared.setup_monitor_enabled.store(false, Ordering::Release);
    let mut state = shared
        .state
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    state.status = SessionStatus::Error;
    state.microphone_muted = true;
    state.active_sound_id = None;
    state.error_code = Some(code.into());
    state.message = Some("An external audio device disconnected. Bakbak silenced the mix.".into());
}

fn active_microphone_buffer(shared: &Shared) -> (&Mutex<VecDeque<f32>>, usize) {
    if shared.setup_testing.load(Ordering::Acquire) {
        (&shared.setup_recording, MAX_SETUP_RECORDING_SAMPLES)
    } else {
        (&shared.live_microphone, MAX_LIVE_MICROPHONE_SAMPLES)
    }
}

fn push_bounded(queue: &mut VecDeque<f32>, sample: f32, capacity: usize) {
    if queue.len() >= capacity {
        queue.pop_front();
    }
    queue.push_back(sample);
}

fn deserialize_setup_samples<'de, D>(deserializer: D) -> Result<Vec<f32>, D::Error>
where
    D: Deserializer<'de>,
{
    deserialize_bounded_samples::<D, MAX_SETUP_RECORDING_SAMPLES>(deserializer)
}

fn deserialize_bounded_samples<'de, D, const MAX: usize>(
    deserializer: D,
) -> Result<Vec<f32>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_seq(BoundedSamplesVisitor::<MAX>)
}

struct BoundedSamplesVisitor<const MAX: usize>;

impl<'de, const MAX: usize> Visitor<'de> for BoundedSamplesVisitor<MAX> {
    type Value = Vec<f32>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "at most {MAX} mono PCM samples")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        if let Some(length) = sequence.size_hint()
            && length > MAX
        {
            return Err(de::Error::invalid_length(length, &self));
        }
        let mut samples = Vec::with_capacity(sequence.size_hint().unwrap_or(0).min(MAX));
        while let Some(sample) = sequence.next_element::<f32>()? {
            if samples.len() >= MAX {
                return Err(de::Error::invalid_length(MAX.saturating_add(1), &self));
            }
            samples.push(sample);
        }
        Ok(samples)
    }
}

fn deserialize_device_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_string(DeviceIdVisitor)
}

fn deserialize_optional_device_id<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    deserializer.deserialize_option(OptionalDeviceIdVisitor)
}

struct DeviceIdVisitor;

impl<'de> Visitor<'de> for DeviceIdVisitor {
    type Value = String;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded native audio device identifier")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        validate_raw_device_id(value).map_err(E::custom)?;
        Ok(value.to_owned())
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        validate_raw_device_id(&value).map_err(E::custom)?;
        Ok(value)
    }
}

struct OptionalDeviceIdVisitor;

impl<'de> Visitor<'de> for OptionalDeviceIdVisitor {
    type Value = Option<String>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a bounded native audio device identifier or null")
    }

    fn visit_none<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(None)
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(None)
    }

    fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserialize_device_id(deserializer).map(Some)
    }
}

fn validate_raw_device_id(value: &str) -> Result<(), &'static str> {
    if value.is_empty()
        || value.len() > MAX_DEVICE_ID_BYTES
        || value.chars().any(|character| character.is_control())
    {
        Err("native audio device identifiers must be 1-1024 control-free bytes")
    } else {
        Ok(())
    }
}

fn validate_config(config: &SessionConfig) -> Result<(), String> {
    validate_device_id(&config.microphone_device_id, "microphone")?;
    validate_device_id(&config.cable_output_device_id, "virtual cable output")?;
    if let Some(monitor_id) = &config.monitor_output_device_id {
        validate_device_id(monitor_id, "headphone output")?;
    }
    if config.microphone_device_id == config.cable_output_device_id {
        return Err("The physical microphone cannot be the virtual cable.".into());
    }
    if config.monitor_output_device_id.is_none() {
        return Err("Choose headphones for sound monitoring.".into());
    }
    if config.monitor_output_device_id.as_deref() == Some(&config.cable_output_device_id) {
        return Err("Choose headphones instead of monitoring through the cable.".into());
    }
    validate_gain(config.microphone_gain)?;
    validate_gain(config.soundboard_gain)
}

fn validate_device_roles(config: &SessionConfig, devices: &DeviceSnapshot) -> Result<(), String> {
    let microphone = devices
        .inputs
        .iter()
        .find(|device| device.id == config.microphone_device_id)
        .ok_or_else(|| "The selected physical microphone is no longer connected.".to_string())?;
    if microphone.cable_kind.is_some() {
        return Err("Choose a real microphone instead of the virtual cable input.".into());
    }
    let cable = devices
        .outputs
        .iter()
        .find(|device| device.id == config.cable_output_device_id)
        .ok_or_else(|| "The selected virtual cable output is no longer connected.".to_string())?;
    if !cable.cable_kind.is_some_and(is_supported_cable) {
        return Err("Choose the BlackHole or VB-CABLE playback endpoint.".into());
    }
    if let Some(monitor_id) = &config.monitor_output_device_id {
        let monitor = devices
            .outputs
            .iter()
            .find(|device| device.id == *monitor_id)
            .ok_or_else(|| "The selected headphone output is no longer connected.".to_string())?;
        if monitor.cable_kind.is_some() {
            return Err("Choose headphones instead of monitoring through a virtual cable.".into());
        }
    }
    Ok(())
}

fn validate_setup_test_config(
    config: &SetupTestConfig,
    devices: &DeviceSnapshot,
) -> Result<(), String> {
    validate_device_id(&config.microphone_device_id, "physical microphone")?;
    let microphone = devices
        .inputs
        .iter()
        .find(|device| device.id == config.microphone_device_id)
        .ok_or_else(|| "The selected physical microphone is no longer connected.".to_string())?;
    if microphone.cable_kind.is_some() {
        return Err("Choose a real microphone instead of a virtual cable input.".into());
    }
    let monitor_id = config
        .monitor_output_device_id
        .as_ref()
        .ok_or_else(|| "Choose headphones before testing audio.".to_string())?;
    validate_device_id(monitor_id, "headphone output")?;
    let monitor = devices
        .outputs
        .iter()
        .find(|device| device.id == *monitor_id)
        .ok_or_else(|| "The selected headphone output is no longer connected.".to_string())?;
    if monitor.cable_kind.is_some() {
        return Err("Choose headphones instead of monitoring through a virtual cable.".into());
    }
    Ok(())
}

fn validate_gain(value: f32) -> Result<(), String> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err("External audio levels must be between 0% and 100%.".into())
    }
}

fn validate_device_id(value: &str, role: &str) -> Result<(), String> {
    validate_raw_device_id(value).map_err(|_| format!("The selected {role} identifier is invalid."))
}

fn detect_cable(label: &str) -> Option<CableKind> {
    let normalized = label.to_lowercase();
    if normalized.contains("blackhole")
        && (normalized.contains("2ch")
            || normalized.contains("2 ch")
            || normalized.contains("stereo"))
    {
        Some(CableKind::Blackhole2ch)
    } else if normalized.contains("blackhole") {
        Some(CableKind::Unknown)
    } else if normalized.contains("vb-audio")
        || normalized.contains("vb-cable")
        || normalized.contains("cable input")
        || normalized.contains("cable output")
    {
        Some(CableKind::VbCable)
    } else {
        None
    }
}

fn is_supported_cable(kind: CableKind) -> bool {
    matches!(kind, CableKind::Blackhole2ch | CableKind::VbCable)
}

fn recommended_cable_pair(
    inputs: &[AudioDevice],
    outputs: &[AudioDevice],
) -> (Option<String>, Option<String>) {
    outputs
        .iter()
        .find_map(|output| {
            let kind = output.cable_kind.filter(|kind| is_supported_cable(*kind))?;
            let input = inputs.iter().find(|input| input.cable_kind == Some(kind))?;
            Some((Some(input.id.clone()), Some(output.id.clone())))
        })
        .unwrap_or((None, None))
}

fn validate_setup_recording(recording: &SetupRecording) -> Result<(), String> {
    if recording.sample_rate != MIX_SAMPLE_RATE {
        return Err("Setup recordings must use 48 kHz mono PCM.".into());
    }
    if recording.samples.is_empty() || recording.samples.len() > MAX_SETUP_RECORDING_SAMPLES {
        return Err("Setup recordings must be between 0 and 2 seconds.".into());
    }
    Ok(())
}

fn soft_limit(sample: f32) -> f32 {
    let magnitude = sample.abs();
    if magnitude <= 0.9 {
        return sample;
    }
    let compressed = 0.9 + 0.08 * (1.0 - (-(magnitude - 0.9) * 6.0).exp());
    sample.signum() * compressed.min(0.98)
}

fn apply_declick_envelope(samples: &mut [f32]) {
    let fade_in = STOP_FADE_SAMPLES.min(samples.len() / 2);
    for (index, sample) in samples.iter_mut().take(fade_in).enumerate() {
        *sample *= index as f32 / fade_in.max(1) as f32;
    }
    let fade_out = NATURAL_FADE_SAMPLES.min(samples.len() / 2);
    let length = samples.len();
    for (index, sample) in samples.iter_mut().rev().take(fade_out).enumerate() {
        *sample *= index as f32 / fade_out.max(1) as f32;
    }
    if length > 0 {
        samples[length - 1] = 0.0;
    }
}

fn stream_error(error: impl std::fmt::Display) -> String {
    format!("Bakbak could not open that audio device: {error}")
}

fn config_error(error: impl std::fmt::Display) -> String {
    format!("Bakbak could not read that audio device configuration: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_tick_is_bounded_and_never_enters_the_cable() {
        let mut cable = SelectionFeedback::default();
        let mut headphones = SelectionFeedback::default();
        let mut peak = 0.0f32;
        for frame in 0..4_800 {
            assert_eq!(cable.next(1, 48_000, OutputRole::Cable), 0.0);
            let value = headphones.next(1, 48_000, OutputRole::Monitor);
            peak = peak.max(value.abs());
            if frame >= 1_152 {
                assert_eq!(value, 0.0);
            }
        }
        assert!(peak > 0.01 && peak <= 0.055);
    }

    #[test]
    fn finds_supported_virtual_cables_without_guessing_unrelated_devices() {
        assert_eq!(detect_cable("BlackHole 2ch"), Some(CableKind::Blackhole2ch));
        assert_eq!(
            detect_cable("CABLE Input (VB-Audio Virtual Cable)"),
            Some(CableKind::VbCable)
        );
        assert_eq!(detect_cable("BlackHole 16ch"), Some(CableKind::Unknown));
        assert_eq!(detect_cable("MacBook Pro Speakers"), None);
    }

    #[test]
    fn recommends_only_a_complete_supported_cable_pair() {
        let inputs = vec![test_device(
            "capture",
            DeviceKind::Input,
            Some(CableKind::VbCable),
        )];
        let outputs = vec![
            test_device(
                "unpaired",
                DeviceKind::Output,
                Some(CableKind::Blackhole2ch),
            ),
            test_device("render", DeviceKind::Output, Some(CableKind::VbCable)),
        ];
        assert_eq!(
            recommended_cable_pair(&inputs, &outputs),
            (Some("capture".into()), Some("render".into()))
        );

        assert_eq!(recommended_cable_pair(&[], &outputs), (None, None));
    }

    #[test]
    fn limiter_is_linear_below_threshold_and_bounded_above_it() {
        assert_eq!(soft_limit(0.5), 0.5);
        assert!(soft_limit(4.0) <= 0.98);
        assert!(soft_limit(-4.0) >= -0.98);
    }

    #[test]
    fn stalled_cable_backlog_is_capped_to_forty_milliseconds() {
        let engine = ExternalAudioEngine::new();
        let (queue, capacity) = active_microphone_buffer(&engine.shared);
        assert_eq!(capacity, MIX_SAMPLE_RATE as usize * 40 / 1_000);

        let mut queue = queue.lock().unwrap();
        for value in 0..(capacity + 10) {
            push_bounded(&mut queue, value as f32, capacity);
        }

        assert_eq!(queue.len(), capacity);
        assert_eq!(queue.front().copied(), Some(10.0));
        assert!(queue.len() <= MIX_SAMPLE_RATE as usize * 50 / 1_000);
    }

    #[test]
    fn setup_recording_keeps_two_seconds_off_the_live_microphone_bus() {
        let engine = ExternalAudioEngine::new();
        engine.shared.setup_testing.store(true, Ordering::Release);
        let (queue, capacity) = active_microphone_buffer(&engine.shared);
        assert_eq!(capacity, MAX_SETUP_RECORDING_SAMPLES);

        let mut queue = queue.lock().unwrap();
        for value in 0..(capacity + 10) {
            push_bounded(&mut queue, value as f32, capacity);
        }

        assert_eq!(queue.len(), MIX_SAMPLE_RATE as usize * 2);
        assert_eq!(queue.front().copied(), Some(10.0));
        assert!(engine.shared.live_microphone.lock().unwrap().is_empty());
    }

    #[test]
    fn rejects_feedback_routing_and_unsafe_levels() {
        let config = SessionConfig {
            microphone_device_id: "mic".into(),
            cable_output_device_id: "cable".into(),
            monitor_output_device_id: Some("cable".into()),
            microphone_gain: 1.0,
            soundboard_gain: 0.7,
        };
        assert!(validate_config(&config).is_err());
        assert!(validate_gain(f32::NAN).is_err());
        assert!(validate_device_id("bad\ndevice", "microphone").is_err());
        assert!(validate_device_id(&"x".repeat(1_025), "microphone").is_err());
    }

    #[test]
    fn requires_a_physical_microphone_and_a_known_virtual_cable() {
        let config = SessionConfig {
            microphone_device_id: "mic".into(),
            cable_output_device_id: "cable".into(),
            monitor_output_device_id: Some("headphones".into()),
            microphone_gain: 1.0,
            soundboard_gain: 0.7,
        };
        let snapshot = DeviceSnapshot {
            inputs: vec![AudioDevice {
                id: "mic".into(),
                label: "Studio mic".into(),
                kind: DeviceKind::Input,
                is_default: true,
                cable_kind: None,
            }],
            outputs: vec![
                AudioDevice {
                    id: "cable".into(),
                    label: "BlackHole 2ch".into(),
                    kind: DeviceKind::Output,
                    is_default: false,
                    cable_kind: Some(CableKind::Blackhole2ch),
                },
                AudioDevice {
                    id: "headphones".into(),
                    label: "Headphones".into(),
                    kind: DeviceKind::Output,
                    is_default: true,
                    cable_kind: None,
                },
            ],
            recommended_cable_input_id: None,
            recommended_cable_output_id: Some("cable".into()),
        };
        assert!(validate_device_roles(&config, &snapshot).is_ok());
        let mut invalid = config;
        invalid.microphone_device_id = "missing".into();
        assert!(validate_device_roles(&invalid, &snapshot).is_err());
        let mut unsupported_snapshot = snapshot;
        unsupported_snapshot.outputs[0].cable_kind = Some(CableKind::Unknown);
        let unsupported = SessionConfig {
            microphone_device_id: "mic".into(),
            cable_output_device_id: "cable".into(),
            monitor_output_device_id: Some("headphones".into()),
            microphone_gain: 1.0,
            soundboard_gain: 0.7,
        };
        assert!(validate_device_roles(&unsupported, &unsupported_snapshot).is_err());
    }

    #[test]
    fn setup_test_rejects_virtual_microphones_and_monitor_loops() {
        let snapshot = DeviceSnapshot {
            inputs: vec![
                test_device("mic", DeviceKind::Input, None),
                test_device(
                    "cable-input",
                    DeviceKind::Input,
                    Some(CableKind::Blackhole2ch),
                ),
            ],
            outputs: vec![
                test_device("headphones", DeviceKind::Output, None),
                test_device(
                    "cable-output",
                    DeviceKind::Output,
                    Some(CableKind::Blackhole2ch),
                ),
            ],
            recommended_cable_input_id: Some("cable-input".into()),
            recommended_cable_output_id: Some("cable-output".into()),
        };
        let valid = SetupTestConfig {
            microphone_device_id: "mic".into(),
            monitor_output_device_id: Some("headphones".into()),
        };
        assert!(validate_setup_test_config(&valid, &snapshot).is_ok());

        let mut virtual_mic = valid.clone();
        virtual_mic.microphone_device_id = "cable-input".into();
        assert!(validate_setup_test_config(&virtual_mic, &snapshot).is_err());

        let mut looped_monitor = valid.clone();
        looped_monitor.monitor_output_device_id = Some("cable-output".into());
        assert!(validate_setup_test_config(&looped_monitor, &snapshot).is_err());

        let mut missing_monitor = valid;
        missing_monitor.monitor_output_device_id = None;
        assert!(validate_setup_test_config(&missing_monitor, &snapshot).is_err());
    }

    #[test]
    fn setup_recordings_are_memory_bounded_and_fixed_rate() {
        assert!(
            validate_setup_recording(&SetupRecording {
                sample_rate: MIX_SAMPLE_RATE,
                samples: vec![0.0; MAX_SETUP_RECORDING_SAMPLES],
            })
            .is_ok()
        );
        assert!(
            validate_setup_recording(&SetupRecording {
                sample_rate: 44_100,
                samples: vec![0.0],
            })
            .is_err()
        );
        assert!(
            validate_setup_recording(&SetupRecording {
                sample_rate: MIX_SAMPLE_RATE,
                samples: vec![0.0; MAX_SETUP_RECORDING_SAMPLES + 1],
            })
            .is_err()
        );
    }

    #[test]
    fn setup_recording_deserialization_rejects_samples_over_the_native_bound() {
        use serde::de::value::{Error, SeqDeserializer};

        let samples = std::iter::repeat_n(0.0_f32, MAX_SETUP_RECORDING_SAMPLES + 1);
        let deserializer = SeqDeserializer::<_, Error>::new(samples);

        assert!(deserialize_setup_samples(deserializer).is_err());
    }

    #[test]
    fn device_id_deserialization_rejects_oversized_and_control_char_values() {
        use serde::de::value::{Error, StrDeserializer};

        let oversized = "x".repeat(MAX_DEVICE_ID_BYTES + 1);
        let oversized_deserializer = StrDeserializer::<Error>::new(&oversized);
        let control_deserializer = StrDeserializer::<Error>::new("device\nidentifier");

        assert!(deserialize_device_id(oversized_deserializer).is_err());
        assert!(deserialize_device_id(control_deserializer).is_err());
    }

    #[test]
    fn sleep_suspends_setup_capture_and_discards_microphone_samples() {
        let engine = ExternalAudioEngine::new();
        engine.shared.running.store(true, Ordering::Release);
        engine.shared.setup_testing.store(true, Ordering::Release);
        engine.set_state(SessionState {
            status: SessionStatus::Testing,
            ..SessionState::default()
        });
        engine
            .shared
            .setup_recording
            .lock()
            .unwrap()
            .extend([0.1, -0.1]);
        engine
            .shared
            .live_microphone
            .lock()
            .unwrap()
            .extend([0.2, -0.2]);

        let state = engine.suspend();

        assert_eq!(state.status, SessionStatus::Suspended);
        assert!(!engine.shared.running.load(Ordering::Acquire));
        assert!(!engine.shared.setup_testing.load(Ordering::Acquire));
        assert!(engine.shared.setup_recording.lock().unwrap().is_empty());
        assert!(engine.shared.live_microphone.lock().unwrap().is_empty());
    }

    #[test]
    fn a_device_failure_during_start_cannot_be_overwritten_by_live_state() {
        let engine = ExternalAudioEngine::new();
        engine.shared.running.store(false, Ordering::Release);
        engine.set_state(SessionState {
            status: SessionStatus::Error,
            error_code: Some("input-device-lost".into()),
            message: Some("The microphone disconnected during startup.".into()),
            ..SessionState::default()
        });

        let result = engine.complete_stream_start(
            SessionState {
                status: SessionStatus::Live,
                ..SessionState::default()
            },
            "fallback",
        );

        assert_eq!(
            result,
            Err("The microphone disconnected during startup.".into())
        );
        assert_eq!(engine.state().status, SessionStatus::Error);
    }

    #[test]
    fn every_clip_enters_and_leaves_at_digital_zero() {
        let mut samples = vec![1.0; NATURAL_FADE_SAMPLES * 2];
        apply_declick_envelope(&mut samples);
        assert_eq!(samples[0], 0.0);
        assert_eq!(samples[samples.len() - 1], 0.0);
        assert!(samples[STOP_FADE_SAMPLES] > 0.9);
    }

    fn test_device(id: &str, kind: DeviceKind, cable_kind: Option<CableKind>) -> AudioDevice {
        AudioDevice {
            id: id.into(),
            label: id.into(),
            kind,
            is_default: false,
            cable_kind,
        }
    }
}
