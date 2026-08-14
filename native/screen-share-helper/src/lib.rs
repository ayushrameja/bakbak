pub mod model;
pub mod policy;
pub mod protocol;
pub mod redaction;
pub mod runtime;

mod platform;
mod publisher;

#[cfg(target_os = "windows")]
mod windows_compat;
#[cfg(target_os = "windows")]
pub(crate) use windows_compat::*;
#[cfg(target_os = "windows")]
mod windows_process;

pub const HELPER_VERSION: &str = env!("CARGO_PKG_VERSION");
