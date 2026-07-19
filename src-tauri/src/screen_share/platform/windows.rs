use std::{
    borrow::Cow,
    collections::VecDeque,
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
    sync::{mpsc, oneshot},
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
            GetWindowThreadProcessId, IsWindowVisible, WS_EX_TOOLWINDOW,
        },
    },
    core::{BOOL, IInspectable, Interface, PWSTR, factory},
};

use super::super::{
    SCREEN_SHARE_FRAME_RATES, SCREEN_SHARE_RESOLUTIONS, ScreenShareCapabilities,
    ScreenShareSettings, ScreenShareSource, ScreenShareSourceKind,
};

const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(5);
const PAUSED_SOURCE_TIMEOUT: Duration = Duration::from_secs(2);
const PROCESS_LOOPBACK_MINIMUM_BUILD: u32 = 20_348;
const AUDIO_SAMPLE_RATE: u32 = 48_000;
const AUDIO_CHANNELS: u32 = 2;
const AUDIO_FRAME_SAMPLES: usize = 480;
const THUMBNAIL_TIMEOUT: Duration = Duration::from_millis(250);
const THUMBNAIL_MAX_WIDTH: u32 = 320;
const THUMBNAIL_MAX_HEIGHT: u32 = 180;

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
    pub include_audio: bool,
    settings: ScreenShareSettings,
    item: GraphicsCaptureItem,
    audio_target: Option<ProcessLoopbackTarget>,
    termination_sender: mpsc::UnboundedSender<String>,
    pause_sender: mpsc::UnboundedSender<bool>,
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
    pub async fn stop(self) {
        self.pause_task.abort();
        if let Some(audio) = self.audio_capture {
            audio.stop.store(true, Ordering::Release);
            let _ = audio.capture_task.await;
            audio.forward_task.abort();
        }
        let _ = self.frame_pool.RemoveFrameArrived(self.frame_token);
        let _ = self.item.RemoveClosed(self.closed_token);
        let _ = self.session.Close();
        let _ = self.frame_pool.Close();
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

pub fn sources() -> Result<Vec<ScreenShareSource>, String> {
    initialize_winrt()?;
    let mut result = enumerate_displays();
    result.extend(enumerate_windows()?);
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
    termination_sender: mpsc::UnboundedSender<String>,
    pause_sender: mpsc::UnboundedSender<bool>,
) -> Result<PreparedCapture, String> {
    initialize_winrt()?;
    let source_id = source_id.ok_or_else(|| "Choose a screen or application first.".to_string())?;
    let target = parse_source_id(source_id)?;
    validate_target(&target)?;
    let item = create_capture_item(&target)?;
    let size = item
        .Size()
        .map_err(|error| format!("Windows could not inspect the selected source: {error}"))?;
    if size.Width <= 0 || size.Height <= 0 {
        return Err("The selected Windows source has no visible capture area.".to_string());
    }
    let source_kind = match target {
        CaptureTarget::Window(_) => ScreenShareSourceKind::Application,
        CaptureTarget::Display(_) => ScreenShareSourceKind::Display,
    };
    let source_label = source_label(&target);
    let audio_target = (include_audio && process_loopback_supported())
        .then(|| process_loopback_target(&target))
        .flatten();
    let (width, height) =
        fit_to_resolution(size.Width as u32, size.Height as u32, settings.resolution);

    Ok(PreparedCapture {
        source_label,
        source_kind,
        width,
        height,
        include_audio: audio_target.is_some(),
        settings,
        item,
        audio_target,
        termination_sender,
        pause_sender,
    })
}

pub async fn start_capture(
    prepared: PreparedCapture,
    video_source: NativeVideoSource,
    audio_source: Option<NativeAudioSource>,
) -> Result<(CaptureSession, bool), String> {
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
    let _ = session.SetIsCursorCaptureEnabled(true);

    let settings = Arc::new(StdMutex::new(prepared.settings));
    let current_size = Arc::new(StdMutex::new(size));
    let last_complete_frame = Arc::new(StdMutex::new(Instant::now()));
    let last_forwarded_frame = Arc::new(StdMutex::new(None::<Instant>));
    let first_frame_seen = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));
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
                    if let Ok(video_frame) = surface_to_i420_frame(
                        &surface,
                        &handler_device,
                        &handler_context,
                        selected_settings,
                    ) {
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
            "Windows started screen capture but did not deliver a video frame.".to_string(),
        );
    }

    let audio_capture = match (prepared.audio_target, audio_source) {
        (Some(target), Some(source)) => start_process_audio_capture(target, source).await.ok(),
        _ => None,
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
    ))
}

fn process_loopback_supported() -> bool {
    process_loopback_supported_for_build(windows_version::OsVersion::current().build)
}

fn process_loopback_supported_for_build(build: u32) -> bool {
    build >= PROCESS_LOOPBACK_MINIMUM_BUILD
}

fn process_loopback_target(target: &CaptureTarget) -> Option<ProcessLoopbackTarget> {
    match target {
        CaptureTarget::Window(hwnd) => {
            let mut process_id = 0;
            unsafe { GetWindowThreadProcessId(*hwnd, Some(&mut process_id)) };
            (process_id != 0).then_some(ProcessLoopbackTarget::IncludeProcessTree(process_id))
        }
        CaptureTarget::Display(_) => Some(ProcessLoopbackTarget::ExcludeProcessTree(unsafe {
            GetCurrentProcessId()
        })),
    }
}

async fn start_process_audio_capture(
    target: ProcessLoopbackTarget,
    source: NativeAudioSource,
) -> Result<ProcessAudioCapture, String> {
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

    Ok(ProcessAudioCapture {
        stop,
        capture_task,
        forward_task,
    })
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

fn validate_target(target: &CaptureTarget) -> Result<(), String> {
    match target {
        CaptureTarget::Window(hwnd) if is_shareable_window(*hwnd) => Ok(()),
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

fn enumerate_windows() -> Result<Vec<ScreenShareSource>, String> {
    let mut windows = Vec::<ScreenShareSource>::new();
    unsafe extern "system" fn callback(hwnd: HWND, data: LPARAM) -> BOOL {
        let sources = unsafe { &mut *(data.0 as *mut Vec<ScreenShareSource>) };
        if !is_shareable_window(hwnd) {
            return BOOL(1);
        }
        let Some(label) = window_title(hwnd) else {
            return BOOL(1);
        };
        let mut pid = 0;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
        sources.push(ScreenShareSource {
            id: format!("window:{}", hwnd.0 as isize),
            kind: ScreenShareSourceKind::Application,
            label,
            application_label: process_label(pid),
            audio_available: process_loopback_supported(),
            thumbnail_data_url: None,
        });
        BOOL(1)
    }
    unsafe {
        EnumWindows(
            Some(callback),
            LPARAM((&mut windows as *mut Vec<ScreenShareSource>) as isize),
        )
    }
    .map_err(|error| format!("Windows could not enumerate application windows: {error}"))?;
    windows.sort_by(|left, right| {
        left.application_label
            .cmp(&right.application_label)
            .then(left.label.cmp(&right.label))
    });
    Ok(windows)
}

fn enumerate_displays() -> Vec<ScreenShareSource> {
    available_monitors()
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| ScreenShareSource {
            id: format!("display:{}", monitor.0 as isize),
            kind: ScreenShareSourceKind::Display,
            label: format!("Screen {}", index + 1),
            application_label: None,
            audio_available: process_loopback_supported(),
            thumbnail_data_url: None,
        })
        .collect()
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

fn is_shareable_window(hwnd: HWND) -> bool {
    if hwnd.0.is_null() {
        return false;
    }
    let visible = unsafe { IsWindowVisible(hwnd) }.as_bool();
    let has_owner = unsafe { GetWindow(hwnd, GW_OWNER) }.is_ok();
    let extended_style = unsafe { GetWindowLongW(hwnd, GWL_EXSTYLE) } as u32;
    let tool_window = extended_style & WS_EX_TOOLWINDOW.0 != 0;
    let mut process_id = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
    let own_process = process_id == unsafe { GetCurrentProcessId() };
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
) -> windows::core::Result<VideoFrame<I420Buffer>> {
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
    Ok(VideoFrame::new(VideoRotation::VideoRotation0, buffer))
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
