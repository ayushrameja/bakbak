use std::{
    borrow::Cow,
    collections::{HashMap, VecDeque},
    path::Path,
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicBool, Ordering},
        mpsc as std_mpsc,
    },
    time::{Duration, Instant},
};

use livekit::webrtc::{
    audio_source::native::NativeAudioSource,
    prelude::{AudioFrame, I420Buffer, VideoFrame, VideoRotation},
    video_source::native::NativeVideoSource,
};
use tokio::{
    sync::{mpsc, oneshot, watch},
    task::JoinHandle,
    time::timeout,
};
use wasapi::{AudioClient, Direction, SampleType, StreamMode, WaveFormat};
use windows::{
    Foundation::TypedEventHandler,
    Graphics::{
        Capture::{Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession},
        DirectX::Direct3D11::IDirect3DDevice,
        DirectX::DirectXPixelFormat,
        SizeInt32,
    },
    Win32::{
        Foundation::{CloseHandle, HMODULE, HWND, LPARAM, RECT},
        Graphics::{
            Direct3D::D3D_DRIVER_TYPE_HARDWARE,
            Direct3D11::{
                D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ,
                D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
                D3D11_USAGE_STAGING, D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext,
                ID3D11Texture2D,
            },
            Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute},
            Dxgi::{Common::DXGI_SAMPLE_DESC, IDXGIDevice},
            Gdi::{EnumDisplayMonitors, HDC, HMONITOR},
        },
        System::{
            Com::{COINIT_MULTITHREADED, CoInitializeEx},
            Threading::{
                GetCurrentProcessId, OpenProcess, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
            },
            WinRT::{
                Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
                Graphics::Capture::IGraphicsCaptureItemInterop,
            },
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GW_OWNER, GWL_EXSTYLE, GetWindow, GetWindowLongW, GetWindowTextW,
            GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, WS_EX_TOOLWINDOW,
        },
    },
    core::{BOOL, IInspectable, Interface, PWSTR, factory},
};

use super::super::{
    SCREEN_SHARE_FRAME_RATES, SCREEN_SHARE_RESOLUTIONS, ScreenShareCapabilities,
    ScreenShareSettings, ScreenShareSource, ScreenShareSourceKind,
    windows_process::{
        WebViewProcessProof, WebViewProcessState, WebViewProcessTracker, process_is_in_tree,
        process_parent_map,
    },
};

const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(5);
const PAUSED_SOURCE_TIMEOUT: Duration = Duration::from_secs(2);
const BLACK_FRAME_TIMEOUT: Duration = Duration::from_secs(2);
const PROCESS_LOOPBACK_MINIMUM_BUILD: u32 = 20_348;
const AUDIO_SAMPLE_RATE: u32 = 48_000;
const AUDIO_CHANNELS: u32 = 2;
const AUDIO_FRAME_SAMPLES: usize = 480;
const THUMBNAIL_TIMEOUT: Duration = Duration::from_millis(250);
const THUMBNAIL_MAX_WIDTH: u32 = 320;
const THUMBNAIL_MAX_HEIGHT: u32 = 180;
const DISPLAY_AUDIO_ISOLATION_REASON: &str = "Bakbak could not verify its WebView2 audio process tree, so Entire screen audio is disabled; video sharing still works.";
const DISPLAY_AUDIO_ISOLATION_CHANGED: &str = "[audio-isolation-unavailable] Bakbak's WebView2 audio process tree changed, so screen audio was stopped; video is still sharing.";

enum CaptureTarget {
    Window(HWND),
    Display(HMONITOR),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ProcessLoopbackTarget {
    IncludeProcessTree(u32),
    ExcludeProcessTree(u32),
}

pub struct PreparedCapture {
    pub source_label: String,
    pub source_kind: ScreenShareSourceKind,
    pub width: u32,
    pub height: u32,
    settings: ScreenShareSettings,
    item: GraphicsCaptureItem,
    audio_target: Option<ProcessLoopbackTarget>,
    audio_unavailable_reason: Option<String>,
    audio_isolation_watch: Option<DisplayAudioIsolationWatch>,
    focus_window: Option<isize>,
    termination_sender: mpsc::UnboundedSender<String>,
    pause_sender: mpsc::UnboundedSender<bool>,
}

impl PreparedCapture {
    pub fn includes_audio(&self) -> bool {
        self.audio_target.is_some()
    }

    pub fn audio_unavailable_reason(&self) -> Option<&str> {
        self.audio_unavailable_reason.as_deref()
    }
}

struct DisplayAudioIsolationWatch {
    proof: WebViewProcessProof,
    receiver: watch::Receiver<WebViewProcessState>,
    failure_sender: mpsc::UnboundedSender<String>,
}

pub struct CaptureSession {
    session: GraphicsCaptureSession,
    frame_pool: Direct3D11CaptureFramePool,
    frame_token: i64,
    closed_token: i64,
    item: GraphicsCaptureItem,
    direct3d_device: SendDirect3DDevice,
    current_size: Arc<StdMutex<SizeInt32>>,
    settings: Arc<StdMutex<ScreenShareSettings>>,
    pause_task: JoinHandle<()>,
    audio_capture: Option<ProcessAudioCapture>,
}

struct ProcessAudioCapture {
    stop: Arc<AtomicBool>,
    capture_task: JoinHandle<()>,
    forward_task: JoinHandle<()>,
    isolation_task: Option<JoinHandle<()>>,
}

struct SendDirect3DDevice(IDirect3DDevice);

// SAFETY: The WinRT wrapper is created over an ID3D11Device, whose methods are
// free-threaded, and is used by a free-threaded capture frame pool. Microsoft
// documents this Direct3D WinRT device as agile across MTA threads.
unsafe impl Send for SendDirect3DDevice {}
unsafe impl Sync for SendDirect3DDevice {}

impl Clone for SendDirect3DDevice {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl SendDirect3DDevice {
    fn recreate_frame_pool(
        &self,
        frame_pool: &Direct3D11CaptureFramePool,
        size: SizeInt32,
    ) -> windows::core::Result<()> {
        frame_pool.Recreate(&self.0, DirectXPixelFormat::B8G8R8A8UIntNormalized, 3, size)
    }
}

impl CaptureSession {
    pub async fn stop(mut self) {
        self.pause_task.abort();
        self.stop_audio().await;
        let _ = self.frame_pool.RemoveFrameArrived(self.frame_token);
        let _ = self.item.RemoveClosed(self.closed_token);
        let _ = self.session.Close();
        let _ = self.frame_pool.Close();
    }

    pub async fn stop_audio(&mut self) {
        if let Some(audio) = self.audio_capture.take() {
            audio.stop.store(true, Ordering::Release);
            let _ = audio.capture_task.await;
            audio.forward_task.abort();
            if let Some(task) = audio.isolation_task {
                task.abort();
            }
        }
    }

    pub async fn update_settings(&self, settings: ScreenShareSettings) -> Result<(), String> {
        let size = *self
            .current_size
            .lock()
            .map_err(|_| "Windows screen size became unavailable.".to_string())?;
        let previous = {
            let mut current = self
                .settings
                .lock()
                .map_err(|_| "Windows screen settings became unavailable.".to_string())?;
            let previous = *current;
            *current = settings;
            previous
        };
        if let Err(error) = self
            .direct3d_device
            .recreate_frame_pool(&self.frame_pool, size)
        {
            if let Ok(mut current) = self.settings.lock() {
                *current = previous;
            }
            let _ = self
                .direct3d_device
                .recreate_frame_pool(&self.frame_pool, size);
            return Err(format!(
                "Windows could not apply the new screen quality: {error}"
            ));
        }
        Ok(())
    }
}

pub fn capabilities() -> ScreenShareCapabilities {
    let process_audio_supported = process_loopback_supported();
    ScreenShareCapabilities {
        available: true,
        native_capture: true,
        system_audio: process_audio_supported,
        source_kinds: vec![
            ScreenShareSourceKind::Display,
            ScreenShareSourceKind::Application,
        ],
        resolutions: SCREEN_SHARE_RESOLUTIONS.to_vec(),
        frame_rates: SCREEN_SHARE_FRAME_RATES.to_vec(),
        dynamic_settings: true,
        custom_picker: true,
        reason: (!process_audio_supported).then(|| {
            format!(
                "Matched source audio requires Windows build {PROCESS_LOOPBACK_MINIMUM_BUILD} or newer; video sharing still works."
            )
        }),
    }
}

pub fn sources(
    webview_processes: Option<WebViewProcessProof>,
) -> Result<Vec<ScreenShareSource>, String> {
    initialize_winrt()?;
    let mut result = enumerate_displays(webview_processes.as_ref());
    result.extend(enumerate_windows(webview_processes.as_ref())?);
    // Previews are best-effort and time-bounded so protected or hung sources
    // never block the Entire screen / Application picker from opening.
    let preview_budget = Instant::now();
    for source in &mut result {
        if preview_budget.elapsed() >= Duration::from_millis(750) {
            break;
        }
        source.thumbnail_data_url = parse_source_id(&source.id)
            .ok()
            .and_then(|target| capture_source_thumbnail(&target).ok());
    }
    Ok(result)
}

pub async fn pick_source(
    include_audio: bool,
    settings: ScreenShareSettings,
    source_id: Option<&str>,
    webview_processes: WebViewProcessTracker,
    audio_failure_sender: mpsc::UnboundedSender<String>,
    termination_sender: mpsc::UnboundedSender<String>,
    pause_sender: mpsc::UnboundedSender<bool>,
) -> Result<PreparedCapture, String> {
    initialize_winrt()?;
    let source_id = source_id.ok_or_else(|| "Choose a screen or application first.".to_string())?;
    let target = parse_source_id(source_id)?;
    let webview_proof = webview_processes.current_proof();
    validate_target(&target, webview_proof.as_ref())?;
    let item = create_capture_item(&target)?;
    let size = item
        .Size()
        .map_err(|error| format!("Windows could not inspect the selected source: {error}"))?;
    if size.Width <= 0 || size.Height <= 0 {
        return Err("The selected Windows source has no visible capture area.".to_string());
    }
    let source_kind = match &target {
        CaptureTarget::Window(_) => ScreenShareSourceKind::Application,
        CaptureTarget::Display(_) => ScreenShareSourceKind::Display,
    };
    let source_label = source_label(&target);
    let (audio_target, audio_unavailable_reason, audio_isolation_watch) = prepare_audio_isolation(
        &target,
        include_audio,
        webview_proof.as_ref(),
        &webview_processes,
        audio_failure_sender,
    );
    let focus_window = match &target {
        CaptureTarget::Window(hwnd) => Some(hwnd.0 as isize),
        CaptureTarget::Display(_) => None,
    };
    let (width, height) =
        fit_to_resolution(size.Width as u32, size.Height as u32, settings.resolution);

    Ok(PreparedCapture {
        source_label,
        source_kind,
        width,
        height,
        settings,
        item,
        audio_target,
        audio_unavailable_reason,
        audio_isolation_watch,
        focus_window,
        termination_sender,
        pause_sender,
    })
}

pub async fn start_capture(
    prepared: PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
) -> Result<(CaptureSession, bool, Option<String>), String> {
    initialize_winrt()?;
    let (device, context, direct3d_device) = create_d3d_device()?;
    let direct3d_device = SendDirect3DDevice(direct3d_device);
    let size = prepared
        .item
        .Size()
        .map_err(|error| format!("Windows could not read the capture size: {error}"))?;
    let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &direct3d_device.0,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        3,
        size,
    )
    .map_err(|error| format!("Windows could not create the screen frame pool: {error}"))?;
    let session = frame_pool
        .CreateCaptureSession(&prepared.item)
        .map_err(|error| format!("Windows could not create the screen capture session: {error}"))?;
    session.SetIsCursorCaptureEnabled(true).map_err(|error| {
        format!(
            "[cursor-unavailable] Windows could not include the cursor in this capture: {error}"
        )
    })?;

    let settings = Arc::new(StdMutex::new(prepared.settings));
    let current_size = Arc::new(StdMutex::new(size));
    let last_complete_frame = Arc::new(StdMutex::new(Instant::now()));
    let last_forwarded_frame = Arc::new(StdMutex::new(None::<Instant>));
    let first_frame_seen = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
    let black_since = Arc::new(StdMutex::new(None::<Instant>));
    let black_reported = Arc::new(AtomicBool::new(false));
    let (first_frame_sender, mut first_frame_receiver) = mpsc::unbounded_channel();

    let handler_settings = settings.clone();
    let handler_size = current_size.clone();
    let handler_last_complete = last_complete_frame.clone();
    let handler_last_forwarded = last_forwarded_frame.clone();
    let handler_first_seen = first_frame_seen.clone();
    let handler_paused = paused.clone();
    let handler_pause_sender = prepared.pause_sender.clone();
    let handler_device = device.clone();
    let handler_context = context.clone();
    let handler_direct3d = direct3d_device.clone();
    let handler_source = video_source.clone();
    let handler_black_since = black_since;
    let handler_black_reported = black_reported;
    let handler_detect_black = prepared.source_kind == ScreenShareSourceKind::Application;
    let handler_termination = prepared.termination_sender.clone();
    let frame_token = frame_pool
        .FrameArrived(
            &TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(
                move |sender, _| {
                    let pool = sender.ok()?;
                    let frame = pool.TryGetNextFrame()?;
                    let content_size = frame.ContentSize()?;
                    if content_size.Width <= 0 || content_size.Height <= 0 {
                        return Ok(());
                    }
                    let prior_size = handler_size.lock().ok().map(|size| *size);
                    if prior_size != Some(content_size) {
                        handler_direct3d.recreate_frame_pool(pool, content_size)?;
                        if let Ok(mut size) = handler_size.lock() {
                            *size = content_size;
                        }
                    }
                    let selected_settings = handler_settings
                        .lock()
                        .map(|settings| *settings)
                        .unwrap_or_default();
                    if !should_forward_frame(
                        &handler_last_forwarded,
                        selected_settings.frame_rate,
                        Instant::now(),
                    ) {
                        return Ok(());
                    }
                    let surface = frame.Surface()?;
                    if let Ok((video_frame, effectively_black)) = surface_to_i420_frame(
                        &surface,
                        &handler_device,
                        &handler_context,
                        selected_settings,
                    ) {
                        if handler_detect_black {
                            let now = Instant::now();
                            if effectively_black {
                                if let Ok(mut since) = handler_black_since.lock() {
                                    let started = *since.get_or_insert(now);
                                    if now.duration_since(started) >= BLACK_FRAME_TIMEOUT
                                        && !handler_black_reported.swap(true, Ordering::AcqRel)
                                    {
                                        let _ = handler_termination.send(
                                            "[capture-black] Windows is receiving only black or cursor-only application frames. Retry with Entire screen and run Valorant in Borderless Windowed mode."
                                                .to_string(),
                                        );
                                    }
                                }
                            } else if let Ok(mut since) = handler_black_since.lock() {
                                *since = None;
                            }
                        }
                        handler_source.capture_frame(&video_frame);
                        if let Ok(mut last) = handler_last_complete.lock() {
                            *last = Instant::now();
                        }
                        if handler_paused.swap(false, Ordering::AcqRel) {
                            let _ = handler_pause_sender.send(false);
                        }
                        if !handler_first_seen.swap(true, Ordering::AcqRel) {
                            let _ = first_frame_sender.send(());
                        }
                    }
                    Ok(())
                },
            ),
        )
        .map_err(|error| format!("Windows could not attach the screen frame handler: {error}"))?;

    let termination_sender = prepared.termination_sender.clone();
    let closed_token = prepared
        .item
        .Closed(&TypedEventHandler::new(move |_, _| {
            let _ = termination_sender.send("The selected Windows source stopped sharing.".into());
            Ok(())
        }))
        .map_err(|error| format!("Windows could not observe the selected source: {error}"))?;

    let pause_task = start_pause_watchdog(
        first_frame_seen,
        paused,
        last_complete_frame,
        prepared.pause_sender,
    );
    session
        .StartCapture()
        .map_err(|error| format!("Windows could not start screen capture: {error}"))?;
    if let Some(hwnd) = prepared.focus_window {
        // Best effort only: Windows may reject foreground activation based on
        // its user-input rules, but capture remains active either way.
        let _ = unsafe { SetForegroundWindow(HWND(hwnd as *mut std::ffi::c_void)) };
    }
    if timeout(FIRST_FRAME_TIMEOUT, first_frame_receiver.recv())
        .await
        .ok()
        .flatten()
        .is_none()
    {
        pause_task.abort();
        let _ = session.Close();
        let _ = frame_pool.Close();
        return Err(
            "[capture-failed] Windows started screen capture but did not deliver a video frame."
                .to_string(),
        );
    }

    let (audio_capture, audio_unavailable_reason) = match (prepared.audio_target, audio_source) {
        (Some(target), Some(source)) => {
            match start_process_audio_capture(target, source, prepared.audio_isolation_watch).await
            {
                Ok(capture) => (Some(capture), None),
                Err(error) => (
                    None,
                    Some(
                        error
                            .strip_prefix("[audio-isolation-unavailable]")
                            .unwrap_or(&error)
                            .trim()
                            .to_string(),
                    ),
                ),
            }
        }
        _ => (None, prepared.audio_unavailable_reason),
    };
    let audio_captured = audio_capture.is_some();

    Ok((
        CaptureSession {
            session,
            frame_pool,
            frame_token,
            closed_token,
            item: prepared.item,
            direct3d_device,
            current_size,
            settings,
            pause_task,
            audio_capture,
        },
        audio_captured,
        audio_unavailable_reason,
    ))
}

fn process_loopback_supported() -> bool {
    process_loopback_supported_for_build(windows_version::OsVersion::current().build)
}

fn process_loopback_supported_for_build(build: u32) -> bool {
    build >= PROCESS_LOOPBACK_MINIMUM_BUILD
}

fn prepare_audio_isolation(
    target: &CaptureTarget,
    include_audio: bool,
    webview_proof: Option<&WebViewProcessProof>,
    webview_processes: &WebViewProcessTracker,
    audio_failure_sender: mpsc::UnboundedSender<String>,
) -> (
    Option<ProcessLoopbackTarget>,
    Option<String>,
    Option<DisplayAudioIsolationWatch>,
) {
    if !include_audio {
        return (None, None, None);
    }
    if !process_loopback_supported() {
        return (None, process_loopback_unavailable_reason(false), None);
    }
    match process_loopback_target(target, webview_proof) {
        Ok(audio_target) => {
            let watch = match audio_target {
                ProcessLoopbackTarget::ExcludeProcessTree(_) => Some(DisplayAudioIsolationWatch {
                    proof: webview_proof
                        .expect("display audio target requires a WebView2 proof")
                        .clone(),
                    receiver: webview_processes.subscribe(),
                    failure_sender: audio_failure_sender,
                }),
                ProcessLoopbackTarget::IncludeProcessTree(_) => None,
            };
            (Some(audio_target), None, watch)
        }
        Err(error) => (
            None,
            Some(
                error
                    .strip_prefix("[audio-isolation-unavailable]")
                    .unwrap_or(&error)
                    .trim()
                    .to_string(),
            ),
            None,
        ),
    }
}

fn process_loopback_target(
    target: &CaptureTarget,
    webview_proof: Option<&WebViewProcessProof>,
) -> Result<ProcessLoopbackTarget, String> {
    match target {
        CaptureTarget::Window(hwnd) => {
            let mut process_id = 0;
            unsafe { GetWindowThreadProcessId(*hwnd, Some(&mut process_id)) };
            let parents = process_parent_map()?;
            application_process_loopback_target(
                process_id,
                unsafe { GetCurrentProcessId() },
                webview_proof,
                &parents,
            )
        }
        CaptureTarget::Display(_) => {
            let proof = webview_proof.ok_or_else(|| {
                format!("[audio-isolation-unavailable] {DISPLAY_AUDIO_ISOLATION_REASON}")
            })?;
            let parents = process_parent_map()?;
            display_process_loopback_target(proof, &parents)
        }
    }
}

fn application_process_loopback_target(
    process_id: u32,
    current_process_id: u32,
    webview_proof: Option<&WebViewProcessProof>,
    process_parents: &HashMap<u32, u32>,
) -> Result<ProcessLoopbackTarget, String> {
    if process_id == 0 {
        return Err(
            "[audio-isolation-unavailable] Windows could not identify the selected application's process tree."
                .to_string(),
        );
    }
    if process_is_in_tree(process_id, current_process_id, process_parents)
        || webview_proof.is_some_and(|proof| {
            process_is_in_tree(process_id, proof.browser_process_id(), process_parents)
        })
    {
        return Err("Bakbak cannot capture its own application audio.".to_string());
    }
    Ok(ProcessLoopbackTarget::IncludeProcessTree(process_id))
}

fn display_process_loopback_target(
    proof: &WebViewProcessProof,
    process_parents: &HashMap<u32, u32>,
) -> Result<ProcessLoopbackTarget, String> {
    if !proof.is_valid_for(process_parents) {
        return Err(format!(
            "[audio-isolation-unavailable] {DISPLAY_AUDIO_ISOLATION_REASON}"
        ));
    }
    Ok(ProcessLoopbackTarget::ExcludeProcessTree(
        proof.browser_process_id(),
    ))
}

async fn start_process_audio_capture(
    target: ProcessLoopbackTarget,
    source: NativeAudioSource,
    mut isolation_watch: Option<DisplayAudioIsolationWatch>,
) -> Result<ProcessAudioCapture, String> {
    if let Some(watch) = isolation_watch.as_ref()
        && !display_audio_isolation_is_current(&watch.proof, &watch.receiver.borrow())
    {
        return Err(format!(
            "[audio-isolation-unavailable] {DISPLAY_AUDIO_ISOLATION_REASON}"
        ));
    }
    let stop = Arc::new(AtomicBool::new(false));
    let capture_stop = stop.clone();
    let (frame_sender, mut frame_receiver) = mpsc::channel::<Vec<i16>>(8);
    let (ready_sender, ready_receiver) = oneshot::channel::<Result<(), String>>();

    let capture_task = tokio::task::spawn_blocking(move || {
        capture_process_audio(target, capture_stop, frame_sender, ready_sender);
    });
    let ready = timeout(FIRST_FRAME_TIMEOUT, ready_receiver)
        .await
        .map_err(|_| "Windows matched-audio capture timed out.".to_string())?
        .map_err(|_| "Windows matched-audio capture stopped during startup.".to_string())?;
    ready?;
    if let Some(watch) = isolation_watch.as_ref()
        && !display_audio_isolation_is_current(&watch.proof, &watch.receiver.borrow())
    {
        stop.store(true, Ordering::Release);
        let _ = capture_task.await;
        return Err(format!(
            "[audio-isolation-unavailable] {DISPLAY_AUDIO_ISOLATION_REASON}"
        ));
    }

    let forward_task = tokio::spawn(async move {
        while let Some(samples) = frame_receiver.recv().await {
            let frame = AudioFrame {
                data: Cow::Owned(samples),
                sample_rate: AUDIO_SAMPLE_RATE,
                num_channels: AUDIO_CHANNELS,
                samples_per_channel: AUDIO_FRAME_SAMPLES as u32,
            };
            if source.capture_frame(&frame).await.is_err() {
                break;
            }
        }
    });
    let isolation_task = isolation_watch.take().map(|mut isolation| {
        let isolation_stop = stop.clone();
        tokio::spawn(async move {
            loop {
                if isolation.receiver.changed().await.is_err() {
                    break;
                }
                if should_stop_for_isolation_change(
                    &isolation_stop,
                    &isolation.proof,
                    &isolation.receiver.borrow(),
                ) {
                    let _ = isolation
                        .failure_sender
                        .send(DISPLAY_AUDIO_ISOLATION_CHANGED.to_string());
                    break;
                }
            }
        })
    });

    Ok(ProcessAudioCapture {
        stop,
        capture_task,
        forward_task,
        isolation_task,
    })
}

fn display_audio_isolation_is_current(
    expected: &WebViewProcessProof,
    state: &WebViewProcessState,
) -> bool {
    state.proof() == Some(expected)
}

fn should_stop_for_isolation_change(
    stop: &AtomicBool,
    expected: &WebViewProcessProof,
    state: &WebViewProcessState,
) -> bool {
    !display_audio_isolation_is_current(expected, state) && !stop.swap(true, Ordering::AcqRel)
}

fn capture_process_audio(
    target: ProcessLoopbackTarget,
    stop: Arc<AtomicBool>,
    frame_sender: mpsc::Sender<Vec<i16>>,
    ready_sender: oneshot::Sender<Result<(), String>>,
) {
    let mut ready_sender = Some(ready_sender);
    let result = (|| -> Result<(), String> {
        wasapi::initialize_mta()
            .ok()
            .map_err(|error| format!("Windows audio initialization failed: {error}"))?;
        let desired_format = WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            AUDIO_SAMPLE_RATE as usize,
            AUDIO_CHANNELS as usize,
            None,
        );
        let (process_id, include_tree) = process_loopback_configuration(target);
        let mut client = AudioClient::new_application_loopback_client(process_id, include_tree)
            .map_err(|error| format!("Windows could not activate matched source audio: {error}"))?;
        client
            .initialize_client(
                &desired_format,
                &Direction::Capture,
                &StreamMode::EventsShared {
                    autoconvert: true,
                    buffer_duration_hns: 0,
                },
            )
            .map_err(|error| {
                format!("Windows could not configure matched source audio: {error}")
            })?;
        let event = client
            .set_get_eventhandle()
            .map_err(|error| format!("Windows could not observe matched source audio: {error}"))?;
        let capture = client
            .get_audiocaptureclient()
            .map_err(|error| format!("Windows could not read matched source audio: {error}"))?;
        client
            .start_stream()
            .map_err(|error| format!("Windows could not start matched source audio: {error}"))?;
        if let Some(sender) = ready_sender.take() {
            let _ = sender.send(Ok(()));
        }

        let bytes_per_frame = AUDIO_CHANNELS as usize * size_of::<f32>();
        let bytes_per_livekit_frame = AUDIO_FRAME_SAMPLES * bytes_per_frame;
        let mut queue = VecDeque::<u8>::new();
        while !stop.load(Ordering::Acquire) {
            while capture
                .get_next_packet_size()
                .map_err(|error| format!("Windows matched source audio failed: {error}"))?
                .unwrap_or(0)
                > 0
            {
                capture
                    .read_from_device_to_deque(&mut queue)
                    .map_err(|error| format!("Windows matched source audio failed: {error}"))?;
            }
            while queue.len() >= bytes_per_livekit_frame {
                let bytes: Vec<u8> = queue.drain(..bytes_per_livekit_frame).collect();
                let samples = float_audio_to_i16(&bytes);
                if frame_sender.blocking_send(samples).is_err() {
                    stop.store(true, Ordering::Release);
                    break;
                }
            }
            let _ = event.wait_for_event(100);
        }
        let _ = client.stop_stream();
        Ok(())
    })();

    if let Err(error) = result
        && let Some(sender) = ready_sender.take()
    {
        let _ = sender.send(Err(error));
    }
}

fn float_audio_to_i16(bytes: &[u8]) -> Vec<i16> {
    bytes
        .chunks_exact(size_of::<f32>())
        .map(|sample| {
            let value = f32::from_ne_bytes([sample[0], sample[1], sample[2], sample[3]]);
            (value.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16
        })
        .collect()
}

fn process_loopback_configuration(target: ProcessLoopbackTarget) -> (u32, bool) {
    match target {
        ProcessLoopbackTarget::IncludeProcessTree(process_id) => (process_id, true),
        ProcessLoopbackTarget::ExcludeProcessTree(process_id) => (process_id, false),
    }
}

fn initialize_winrt() -> Result<(), String> {
    // S_FALSE is a successful result when this thread was already initialized.
    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
        .ok()
        .map_err(|error| format!("Windows capture initialization failed: {error}"))
}

fn parse_source_id(source_id: &str) -> Result<CaptureTarget, String> {
    let (kind, raw) = source_id
        .split_once(':')
        .ok_or_else(|| "The selected Windows source is invalid.".to_string())?;
    let handle = raw
        .parse::<isize>()
        .map_err(|_| "The selected Windows source is invalid.".to_string())?;
    match kind {
        "window" => Ok(CaptureTarget::Window(HWND(handle as *mut _))),
        "display" => Ok(CaptureTarget::Display(HMONITOR(handle as *mut _))),
        _ => Err("The selected Windows source is invalid.".to_string()),
    }
}

fn validate_target(
    target: &CaptureTarget,
    webview_proof: Option<&WebViewProcessProof>,
) -> Result<(), String> {
    match target {
        CaptureTarget::Window(hwnd) if is_shareable_window(*hwnd, webview_proof) => Ok(()),
        CaptureTarget::Display(monitor) if is_available_monitor(*monitor) => Ok(()),
        CaptureTarget::Display(_) => {
            Err("The selected display is no longer available.".to_string())
        }
        CaptureTarget::Window(_) => {
            Err("The selected application window is no longer available.".to_string())
        }
    }
}

fn create_capture_item(target: &CaptureTarget) -> Result<GraphicsCaptureItem, String> {
    let interop: IGraphicsCaptureItemInterop =
        factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .map_err(|error| format!("Windows capture is unavailable: {error}"))?;
    unsafe {
        match target {
            CaptureTarget::Window(hwnd) => interop.CreateForWindow(*hwnd),
            CaptureTarget::Display(monitor) => interop.CreateForMonitor(*monitor),
        }
    }
    .map_err(|error| format!("Windows could not open the selected source: {error}"))
}

fn source_label(target: &CaptureTarget) -> String {
    match target {
        CaptureTarget::Window(hwnd) => window_title(*hwnd).unwrap_or_else(|| "Application".into()),
        CaptureTarget::Display(_) => "Shared screen".into(),
    }
}

fn enumerate_windows(
    webview_proof: Option<&WebViewProcessProof>,
) -> Result<Vec<ScreenShareSource>, String> {
    struct EnumerationContext {
        sources: Vec<ScreenShareSource>,
        process_parents: HashMap<u32, u32>,
        current_process_id: u32,
        webview_proof: Option<WebViewProcessProof>,
        audio_supported: bool,
        audio_unavailable_reason: Option<String>,
    }

    unsafe extern "system" fn callback(hwnd: HWND, data: LPARAM) -> BOOL {
        let context = unsafe { &mut *(data.0 as *mut EnumerationContext) };
        if !is_shareable_window_with_process_map(
            hwnd,
            context.current_process_id,
            context.webview_proof.as_ref(),
            &context.process_parents,
        ) {
            return BOOL(1);
        }
        let Some(label) = window_title(hwnd) else {
            return BOOL(1);
        };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        context.sources.push(ScreenShareSource {
            id: format!("window:{}", hwnd.0 as isize),
            kind: ScreenShareSourceKind::Application,
            label,
            application_label: process_label(pid),
            audio_available: context.audio_supported,
            audio_unavailable_reason: context.audio_unavailable_reason.clone(),
            thumbnail_data_url: None,
        });
        BOOL(1)
    }
    let audio_supported = process_loopback_supported();
    let mut context = EnumerationContext {
        sources: Vec::new(),
        process_parents: process_parent_map()?,
        current_process_id: unsafe { GetCurrentProcessId() },
        webview_proof: webview_proof.cloned(),
        audio_supported,
        audio_unavailable_reason: process_loopback_unavailable_reason(audio_supported),
    };
    unsafe {
        EnumWindows(
            Some(callback),
            LPARAM((&mut context as *mut EnumerationContext) as isize),
        )
    }
    .map_err(|error| format!("Windows could not enumerate application windows: {error}"))?;
    let mut windows = context.sources;
    windows.sort_by(|left, right| {
        left.application_label
            .cmp(&right.application_label)
            .then(left.label.cmp(&right.label))
    });
    Ok(windows)
}

fn enumerate_displays(webview_proof: Option<&WebViewProcessProof>) -> Vec<ScreenShareSource> {
    let (audio_supported, audio_unavailable_reason) = display_audio_availability(webview_proof);
    available_monitors()
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| ScreenShareSource {
            id: format!("display:{}", monitor.0 as isize),
            kind: ScreenShareSourceKind::Display,
            label: format!("Screen {}", index + 1),
            application_label: None,
            audio_available: audio_supported,
            audio_unavailable_reason: audio_unavailable_reason.clone(),
            thumbnail_data_url: None,
        })
        .collect()
}

fn display_audio_availability(
    webview_proof: Option<&WebViewProcessProof>,
) -> (bool, Option<String>) {
    let supported = process_loopback_supported();
    let proven = webview_proof
        .and_then(|proof| {
            process_parent_map()
                .ok()
                .filter(|parents| proof.is_valid_for(parents))
        })
        .is_some();
    display_audio_availability_for(supported, proven)
}

fn display_audio_availability_for(
    process_loopback_supported: bool,
    webview_process_tree_proven: bool,
) -> (bool, Option<String>) {
    if !process_loopback_supported {
        return (false, process_loopback_unavailable_reason(false));
    }
    let audio_available = webview_process_tree_proven;
    (
        audio_available,
        (!audio_available).then(|| DISPLAY_AUDIO_ISOLATION_REASON.to_string()),
    )
}

fn available_monitors() -> Vec<HMONITOR> {
    let mut monitors = Vec::<HMONITOR>::new();
    unsafe extern "system" fn callback(
        monitor: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        unsafe { &mut *(data.0 as *mut Vec<HMONITOR>) }.push(monitor);
        BOOL(1)
    }
    unsafe {
        let _ = EnumDisplayMonitors(
            None,
            None,
            Some(callback),
            LPARAM((&mut monitors as *mut Vec<HMONITOR>) as isize),
        );
    }
    monitors
}

fn is_available_monitor(candidate: HMONITOR) -> bool {
    !candidate.0.is_null()
        && available_monitors()
            .into_iter()
            .any(|monitor| monitor == candidate)
}

fn capture_source_thumbnail(target: &CaptureTarget) -> Result<String, String> {
    let item = create_capture_item(target)?;
    let size = item
        .Size()
        .map_err(|error| format!("Windows could not inspect a source preview: {error}"))?;
    let (device, context, direct3d_device) = create_d3d_device()?;
    let frame_pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &direct3d_device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        1,
        size,
    )
    .map_err(|error| format!("Windows could not create a source preview: {error}"))?;
    let session = frame_pool
        .CreateCaptureSession(&item)
        .map_err(|error| format!("Windows could not start a source preview: {error}"))?;
    let _ = session.SetIsCursorCaptureEnabled(false);
    let (sender, receiver) = std_mpsc::sync_channel(1);
    let token = frame_pool
        .FrameArrived(
            &TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(
                move |sender_pool, _| {
                    let pool = sender_pool.ok()?;
                    let frame = pool.TryGetNextFrame()?;
                    let surface = frame.Surface()?;
                    if let Ok(thumbnail) =
                        surface_to_thumbnail_data_url(&surface, &device, &context)
                    {
                        let _ = sender.try_send(thumbnail);
                    }
                    Ok(())
                },
            ),
        )
        .map_err(|error| format!("Windows could not observe a source preview: {error}"))?;
    session
        .StartCapture()
        .map_err(|error| format!("Windows could not capture a source preview: {error}"))?;
    let result = receiver
        .recv_timeout(THUMBNAIL_TIMEOUT)
        .map_err(|_| "Windows did not return a source preview in time.".to_string());
    let _ = frame_pool.RemoveFrameArrived(token);
    let _ = session.Close();
    let _ = frame_pool.Close();
    result
}

fn surface_to_thumbnail_data_url(
    surface: &windows::Graphics::DirectX::Direct3D11::IDirect3DSurface,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
) -> windows::core::Result<String> {
    let access: IDirect3DDxgiInterfaceAccess = surface.cast()?;
    let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
    let mut source_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut source_desc) };
    let staging_desc = D3D11_TEXTURE2D_DESC {
        Width: source_desc.Width,
        Height: source_desc.Height,
        MipLevels: 1,
        ArraySize: 1,
        Format: source_desc.Format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut staging = None;
    unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging))? };
    let staging = staging.expect("D3D11 returned a successful preview staging texture");
    unsafe { context.CopyResource(&staging, &texture) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))? };
    let row_pitch = mapped.RowPitch as usize;
    let bytes = unsafe {
        std::slice::from_raw_parts(
            mapped.pData.cast::<u8>(),
            row_pitch * source_desc.Height as usize,
        )
    };
    let (width, height) = fit_within(
        source_desc.Width,
        source_desc.Height,
        THUMBNAIL_MAX_WIDTH,
        THUMBNAIL_MAX_HEIGHT,
    );
    let bitmap = bgra_thumbnail_bitmap(
        bytes,
        row_pitch,
        source_desc.Width,
        source_desc.Height,
        width,
        height,
    );
    unsafe { context.Unmap(&staging, 0) };
    Ok(format!("data:image/bmp;base64,{}", encode_base64(&bitmap)))
}

fn bgra_thumbnail_bitmap(
    source: &[u8],
    row_pitch: usize,
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
) -> Vec<u8> {
    const FILE_HEADER_SIZE: usize = 14;
    const INFO_HEADER_SIZE: usize = 40;
    let pixel_bytes = output_width as usize * output_height as usize * 4;
    let mut bitmap = Vec::with_capacity(FILE_HEADER_SIZE + INFO_HEADER_SIZE + pixel_bytes);
    bitmap.extend_from_slice(b"BM");
    bitmap.extend_from_slice(
        &((FILE_HEADER_SIZE + INFO_HEADER_SIZE + pixel_bytes) as u32).to_le_bytes(),
    );
    bitmap.extend_from_slice(&[0; 4]);
    bitmap.extend_from_slice(&((FILE_HEADER_SIZE + INFO_HEADER_SIZE) as u32).to_le_bytes());
    bitmap.extend_from_slice(&(INFO_HEADER_SIZE as u32).to_le_bytes());
    bitmap.extend_from_slice(&(output_width as i32).to_le_bytes());
    bitmap.extend_from_slice(&(output_height as i32).to_le_bytes());
    bitmap.extend_from_slice(&1u16.to_le_bytes());
    bitmap.extend_from_slice(&32u16.to_le_bytes());
    bitmap.extend_from_slice(&0u32.to_le_bytes());
    bitmap.extend_from_slice(&(pixel_bytes as u32).to_le_bytes());
    bitmap.extend_from_slice(&[0; 16]);
    for output_y in (0..output_height).rev() {
        let source_y = output_y as usize * source_height as usize / output_height as usize;
        for output_x in 0..output_width {
            let source_x = output_x as usize * source_width as usize / output_width as usize;
            let offset = source_y * row_pitch + source_x * 4;
            bitmap.extend_from_slice(&source[offset..offset + 4]);
        }
    }
    bitmap
}

fn fit_within(width: u32, height: u32, max_width: u32, max_height: u32) -> (u32, u32) {
    let scale = (max_width as f64 / width.max(1) as f64)
        .min(max_height as f64 / height.max(1) as f64)
        .min(1.0);
    (
        (width as f64 * scale).round().max(1.0) as u32,
        (height as f64 * scale).round().max(1.0) as u32,
    )
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0b11) << 4) | (second >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[(((second & 0b1111) << 2) | (third >> 6)) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(third & 0b11_1111) as usize] as char
        } else {
            '='
        });
    }
    output
}

fn is_shareable_window(hwnd: HWND, webview_proof: Option<&WebViewProcessProof>) -> bool {
    let Ok(process_parents) = process_parent_map() else {
        return false;
    };
    is_shareable_window_with_process_map(
        hwnd,
        unsafe { GetCurrentProcessId() },
        webview_proof,
        &process_parents,
    )
}

fn is_shareable_window_with_process_map(
    hwnd: HWND,
    current_process_id: u32,
    webview_proof: Option<&WebViewProcessProof>,
    process_parents: &HashMap<u32, u32>,
) -> bool {
    if hwnd.0.is_null() {
        return false;
    }
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();
    let has_owner = unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok();
    let extended_style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
    let tool_window = extended_style & WS_EX_TOOLWINDOW.0 != 0;
    let mut process_id = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
    let own_process = process_is_in_tree(process_id, current_process_id, process_parents)
        || webview_proof.is_some_and(|proof| {
            process_is_in_tree(process_id, proof.browser_process_id(), process_parents)
        });
    let mut cloaked = 0u32;
    let cloaked = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            (&mut cloaked as *mut u32).cast(),
            size_of::<u32>() as u32,
        )
    }
    .is_ok()
        && cloaked != 0;
    is_shareable_window_metadata(
        visible,
        has_owner,
        tool_window,
        own_process,
        cloaked,
        window_title(hwnd).is_some(),
    )
}

fn process_loopback_unavailable_reason(supported: bool) -> Option<String> {
    (!supported).then(|| {
        format!(
            "Matched source audio requires Windows build {PROCESS_LOOPBACK_MINIMUM_BUILD} or newer; video sharing still works."
        )
    })
}

fn is_shareable_window_metadata(
    visible: bool,
    has_owner: bool,
    tool_window: bool,
    own_process: bool,
    cloaked: bool,
    has_title: bool,
) -> bool {
    visible && !has_owner && !tool_window && !own_process && !cloaked && has_title
}

fn window_title(hwnd: HWND) -> Option<String> {
    let mut buffer = [0u16; 512];
    let count = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    (count > 0)
        .then(|| String::from_utf16_lossy(&buffer[..count as usize]))
        .filter(|title| !title.trim().is_empty())
}

fn process_label(process_id: u32) -> Option<String> {
    let process =
        unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;
    let mut buffer = [0u16; 1024];
    let mut length = buffer.len() as u32;
    let queried = unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut length,
        )
    }
    .is_ok();
    let _ = unsafe { CloseHandle(process) };
    if !queried {
        return None;
    }
    Path::new(&String::from_utf16_lossy(&buffer[..length as usize]))
        .file_stem()
        .map(|name| name.to_string_lossy().into_owned())
}

fn create_d3d_device() -> Result<(ID3D11Device, ID3D11DeviceContext, IDirect3DDevice), String> {
    let mut device = None;
    let mut context = None;
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
    }
    .map_err(|error| format!("Windows could not create a D3D11 capture device: {error}"))?;
    let device = device.ok_or_else(|| "Windows returned no D3D11 device.".to_string())?;
    let context = context.ok_or_else(|| "Windows returned no D3D11 context.".to_string())?;
    let dxgi: IDXGIDevice = device
        .cast()
        .map_err(|error| format!("Windows could not access the DXGI device: {error}"))?;
    let inspectable = unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi) }
        .map_err(|error| format!("Windows could not create a WinRT D3D device: {error}"))?;
    let direct3d_device = inspectable
        .cast::<IDirect3DDevice>()
        .map_err(|error| format!("Windows could not use the WinRT D3D device: {error}"))?;
    Ok((device, context, direct3d_device))
}

fn surface_to_i420_frame(
    surface: &windows::Graphics::DirectX::Direct3D11::IDirect3DSurface,
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    settings: ScreenShareSettings,
) -> windows::core::Result<(VideoFrame<I420Buffer>, bool)> {
    let access: IDirect3DDxgiInterfaceAccess = surface.cast()?;
    let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
    let mut source_desc = D3D11_TEXTURE2D_DESC::default();
    unsafe { texture.GetDesc(&mut source_desc) };
    let staging_desc = D3D11_TEXTURE2D_DESC {
        Width: source_desc.Width,
        Height: source_desc.Height,
        MipLevels: 1,
        ArraySize: 1,
        Format: source_desc.Format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut staging = None;
    unsafe { device.CreateTexture2D(&staging_desc, None, Some(&mut staging))? };
    let staging = staging.expect("D3D11 returned a successful staging texture");
    unsafe { context.CopyResource(&staging, &texture) };
    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    unsafe { context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))? };
    let row_pitch = mapped.RowPitch as usize;
    let bytes = unsafe {
        std::slice::from_raw_parts(
            mapped.pData.cast::<u8>(),
            row_pitch * source_desc.Height as usize,
        )
    };
    let effectively_black =
        bgra_frame_is_effectively_black(bytes, row_pitch, source_desc.Width, source_desc.Height);
    let (output_width, output_height) =
        fit_to_resolution(source_desc.Width, source_desc.Height, settings.resolution);
    let buffer = bgra_to_i420(
        bytes,
        row_pitch,
        source_desc.Width,
        source_desc.Height,
        output_width,
        output_height,
    );
    unsafe { context.Unmap(&staging, 0) };
    Ok((
        VideoFrame::new(VideoRotation::VideoRotation0, buffer),
        effectively_black,
    ))
}

fn bgra_frame_is_effectively_black(
    source: &[u8],
    row_pitch: usize,
    width: u32,
    height: u32,
) -> bool {
    if width == 0 || height == 0 || source.len() < row_pitch * height as usize {
        return true;
    }
    let step_x = (width as usize / 64).max(1);
    let step_y = (height as usize / 36).max(1);
    let mut sampled = 0usize;
    let mut visible = 0usize;
    for y in (0..height as usize).step_by(step_y) {
        for x in (0..width as usize).step_by(step_x) {
            let offset = y * row_pitch + x * 4;
            let Some(pixel) = source.get(offset..offset + 3) else {
                continue;
            };
            sampled += 1;
            if pixel.iter().copied().max().unwrap_or(0) > 16 {
                visible += 1;
            }
        }
    }
    sampled == 0 || visible * 200 < sampled
}

fn bgra_to_i420(
    source: &[u8],
    row_pitch: usize,
    source_width: u32,
    source_height: u32,
    output_width: u32,
    output_height: u32,
) -> I420Buffer {
    let mut output = I420Buffer::new(output_width, output_height);
    let (y_plane, u_plane, v_plane) = output.data_mut();
    for y in 0..output_height {
        for x in 0..output_width {
            let source_x = x as usize * source_width as usize / output_width as usize;
            let source_y = y as usize * source_height as usize / output_height as usize;
            let offset = source_y * row_pitch + source_x * 4;
            let b = source[offset] as f32;
            let g = source[offset + 1] as f32;
            let r = source[offset + 2] as f32;
            y_plane[(y * output_width + x) as usize] =
                (0.257 * r + 0.504 * g + 0.098 * b + 16.0).clamp(0.0, 255.0) as u8;
        }
    }
    let chroma_width = output_width.div_ceil(2);
    let chroma_height = output_height.div_ceil(2);
    for y in 0..chroma_height {
        for x in 0..chroma_width {
            let source_x = (x * 2) as usize * source_width as usize / output_width as usize;
            let source_y = (y * 2) as usize * source_height as usize / output_height as usize;
            let offset = source_y.min(source_height as usize - 1) * row_pitch
                + source_x.min(source_width as usize - 1) * 4;
            let b = source[offset] as f32;
            let g = source[offset + 1] as f32;
            let r = source[offset + 2] as f32;
            let index = (y * chroma_width + x) as usize;
            u_plane[index] = (-0.148 * r - 0.291 * g + 0.439 * b + 128.0).clamp(0.0, 255.0) as u8;
            v_plane[index] = (0.439 * r - 0.368 * g - 0.071 * b + 128.0).clamp(0.0, 255.0) as u8;
        }
    }
    output
}

fn should_forward_frame(
    last_frame: &StdMutex<Option<Instant>>,
    frame_rate: u32,
    now: Instant,
) -> bool {
    let Ok(mut last) = last_frame.lock() else {
        return false;
    };
    let minimum = Duration::from_secs_f64(1.0 / frame_rate.max(1) as f64);
    if last.is_some_and(|previous| now.duration_since(previous) < minimum) {
        return false;
    }
    *last = Some(now);
    true
}

fn start_pause_watchdog(
    first_frame_seen: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    last_complete_frame: Arc<StdMutex<Instant>>,
    pause_sender: mpsc::UnboundedSender<bool>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(250));
        loop {
            interval.tick().await;
            if !first_frame_seen.load(Ordering::Acquire) {
                continue;
            }
            let elapsed = last_complete_frame
                .lock()
                .map(|last| last.elapsed())
                .unwrap_or_default();
            if should_enter_paused(
                first_frame_seen.load(Ordering::Acquire),
                paused.load(Ordering::Acquire),
                elapsed,
            ) && !paused.swap(true, Ordering::AcqRel)
            {
                let _ = pause_sender.send(true);
            }
        }
    })
}

fn should_enter_paused(first_frame_seen: bool, paused: bool, elapsed: Duration) -> bool {
    first_frame_seen && !paused && elapsed >= PAUSED_SOURCE_TIMEOUT
}

fn fit_to_resolution(width: u32, height: u32, resolution: u32) -> (u32, u32) {
    if width == 0 || height == 0 {
        return (resolution * 16 / 9, resolution);
    }
    let max_width = resolution as f64 * 16.0 / 9.0;
    let scale = (max_width / width as f64)
        .min(resolution as f64 / height as f64)
        .min(1.0);
    let even = |value: f64| ((value.round() as u32).max(2) / 2) * 2;
    (even(width as f64 * scale), even(height as f64 * scale))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepared_capture_can_cross_the_tauri_async_boundary() {
        fn assert_send<T: Send>() {}

        assert_send::<PreparedCapture>();
    }

    #[test]
    fn parses_only_supported_source_identifiers() {
        assert!(matches!(
            parse_source_id("window:42"),
            Ok(CaptureTarget::Window(_))
        ));
        assert!(matches!(
            parse_source_id("display:12"),
            Ok(CaptureTarget::Display(_))
        ));
        assert!(parse_source_id("process:7").is_err());
        assert!(parse_source_id("window:nope").is_err());
    }

    #[test]
    fn filters_private_or_invalid_application_windows() {
        assert!(is_shareable_window_metadata(
            true, false, false, false, false, true
        ));
        assert!(!is_shareable_window_metadata(
            false, false, false, false, false, true
        ));
        assert!(!is_shareable_window_metadata(
            true, true, false, false, false, true
        ));
        assert!(!is_shareable_window_metadata(
            true, false, true, false, false, true
        ));
        assert!(!is_shareable_window_metadata(
            true, false, false, true, false, true
        ));
        assert!(!is_shareable_window_metadata(
            true, false, false, false, true, true
        ));
        assert!(!is_shareable_window_metadata(
            true, false, false, false, false, false
        ));
    }

    #[test]
    fn caps_and_evenly_sizes_wide_and_tall_sources() {
        assert_eq!(fit_to_resolution(3840, 2160, 1080), (1920, 1080));
        assert_eq!(fit_to_resolution(1920, 1200, 480), (768, 480));
    }

    #[test]
    fn throttles_frames_at_the_selected_rate() {
        let start = Instant::now();
        let last = StdMutex::new(None);
        assert!(should_forward_frame(&last, 60, start));
        assert!(!should_forward_frame(
            &last,
            60,
            start + Duration::from_millis(5)
        ));
        assert!(should_forward_frame(
            &last,
            60,
            start + Duration::from_millis(17)
        ));
    }

    #[test]
    fn pauses_only_after_two_seconds_without_a_complete_frame() {
        assert!(!should_enter_paused(false, false, Duration::from_secs(3)));
        assert!(!should_enter_paused(
            true,
            false,
            Duration::from_millis(1_999)
        ));
        assert!(should_enter_paused(true, false, Duration::from_secs(2)));
        assert!(!should_enter_paused(true, true, Duration::from_secs(3)));
    }

    #[test]
    fn gates_process_loopback_to_supported_windows_builds() {
        assert!(!process_loopback_supported_for_build(
            PROCESS_LOOPBACK_MINIMUM_BUILD - 1
        ));
        assert!(process_loopback_supported_for_build(
            PROCESS_LOOPBACK_MINIMUM_BUILD
        ));
    }

    #[test]
    fn maps_application_and_display_audio_to_private_process_tree_modes() {
        assert_eq!(
            process_loopback_configuration(ProcessLoopbackTarget::IncludeProcessTree(42)),
            (42, true)
        );
        assert_eq!(
            process_loopback_configuration(ProcessLoopbackTarget::ExcludeProcessTree(7)),
            (7, false)
        );
    }

    #[test]
    fn rejects_bakbak_and_descendant_application_processes() {
        let parents = HashMap::from([(11, 10), (12, 11), (20, 1)]);
        assert!(process_is_in_tree(10, 10, &parents));
        assert!(process_is_in_tree(11, 10, &parents));
        assert!(process_is_in_tree(12, 10, &parents));
        assert!(!process_is_in_tree(20, 10, &parents));
        assert!(!process_is_in_tree(0, 10, &parents));
    }

    #[test]
    fn process_tree_walk_fails_closed_on_cycles() {
        let parents = HashMap::from([(11, 12), (12, 11)]);
        assert!(!process_is_in_tree(11, 10, &parents));
    }

    #[test]
    fn entire_screen_excludes_the_webview2_browser_not_the_tauri_host() {
        let parents = HashMap::from([(10, 1), (20, 10), (21, 20)]);
        let proof = WebViewProcessProof::for_test(20, [20, 21]);
        assert_eq!(
            display_process_loopback_target(&proof, &parents),
            Ok(ProcessLoopbackTarget::ExcludeProcessTree(20))
        );
        assert_ne!(
            display_process_loopback_target(&proof, &parents),
            Ok(ProcessLoopbackTarget::ExcludeProcessTree(10))
        );
    }

    #[test]
    fn unproven_display_audio_never_falls_back_to_system_loopback() {
        let parents = HashMap::from([(10, 1), (20, 10), (30, 1)]);
        let detached = WebViewProcessProof::for_test(20, [20, 30]);
        assert!(display_process_loopback_target(&detached, &parents).is_err());
    }

    #[test]
    fn application_audio_keeps_selected_tree_and_rejects_bakbak_processes() {
        let parents = HashMap::from([(10, 1), (11, 10), (20, 10), (21, 20), (22, 21), (30, 1)]);
        let proof = WebViewProcessProof::for_test(20, [20, 21]);
        assert_eq!(
            application_process_loopback_target(30, 10, Some(&proof), &parents),
            Ok(ProcessLoopbackTarget::IncludeProcessTree(30))
        );
        assert!(application_process_loopback_target(11, 10, Some(&proof), &parents).is_err());
        assert!(application_process_loopback_target(21, 10, Some(&proof), &parents).is_err());
        assert!(application_process_loopback_target(22, 10, Some(&proof), &parents).is_err());
    }

    #[test]
    fn a_webview2_topology_change_invalidates_active_audio() {
        let initial = WebViewProcessProof::for_test(20, [20, 21]);
        let changed = WebViewProcessProof::for_test(20, [20, 21, 22]);
        let stop = AtomicBool::new(false);
        assert!(display_audio_isolation_is_current(
            &initial,
            &WebViewProcessState::Proven(initial.clone())
        ));
        assert!(!display_audio_isolation_is_current(
            &initial,
            &WebViewProcessState::Proven(changed.clone())
        ));
        assert!(!display_audio_isolation_is_current(
            &initial,
            &WebViewProcessState::Unavailable
        ));
        assert!(should_stop_for_isolation_change(
            &stop,
            &initial,
            &WebViewProcessState::Proven(changed.clone())
        ));
        assert!(!should_stop_for_isolation_change(
            &stop,
            &initial,
            &WebViewProcessState::Proven(changed)
        ));
    }

    #[test]
    fn classifies_black_and_cursor_only_frames_without_rejecting_game_pixels() {
        let mut black = vec![0u8; 100 * 100 * 4];
        for pixel in black.chunks_exact_mut(4) {
            pixel[3] = 255;
        }
        assert!(bgra_frame_is_effectively_black(&black, 400, 100, 100));

        for y in 48..52 {
            for x in 48..52 {
                let offset = y * 400 + x * 4;
                black[offset..offset + 3].fill(255);
            }
        }
        assert!(bgra_frame_is_effectively_black(&black, 400, 100, 100));

        let visible = vec![120u8; 100 * 100 * 4];
        assert!(!bgra_frame_is_effectively_black(&visible, 400, 100, 100));
    }

    #[test]
    fn gives_unsupported_sources_a_video_only_reason() {
        assert!(process_loopback_unavailable_reason(true).is_none());
        let reason = process_loopback_unavailable_reason(false)
            .expect("unsupported builds explain fallback");
        assert!(reason.contains("video sharing still works"));
        assert!(reason.contains(&PROCESS_LOOPBACK_MINIMUM_BUILD.to_string()));
    }

    #[test]
    fn display_source_audio_availability_requires_build_and_webview2_proof() {
        assert_eq!(display_audio_availability_for(true, true), (true, None));
        let unsupported = display_audio_availability_for(false, true);
        assert!(!unsupported.0);
        assert!(
            unsupported
                .1
                .as_deref()
                .is_some_and(|reason| reason.contains("20348"))
        );
        let unproven = display_audio_availability_for(true, false);
        assert!(!unproven.0);
        assert!(
            unproven
                .1
                .as_deref()
                .is_some_and(|reason| reason.contains("WebView2"))
        );
    }

    #[test]
    fn converts_float_audio_to_interleaved_pcm() {
        let bytes: Vec<u8> = [-1.0f32, 0.0, 0.5, 1.0]
            .into_iter()
            .flat_map(f32::to_ne_bytes)
            .collect();
        assert_eq!(
            float_audio_to_i16(&bytes),
            vec![i16::MIN + 1, 0, 16_384, i16::MAX]
        );
    }

    #[test]
    fn creates_in_memory_bitmap_thumbnails() {
        let source = [
            0u8, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 255, 255, 255, 255,
        ];
        let bitmap = bgra_thumbnail_bitmap(&source, 8, 2, 2, 2, 2);
        assert_eq!(&bitmap[..2], b"BM");
        assert_eq!(bitmap.len(), 54 + source.len());
        assert_eq!(encode_base64(b"Bakbak"), "QmFrYmFr");
    }
}
