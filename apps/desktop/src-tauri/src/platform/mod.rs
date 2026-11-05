//! OS-specific window behaviour. Windows gets the real implementation; other
//! platforms get no-op fallbacks so the crate still builds.

#[cfg(windows)]
mod win;
#[cfg(windows)]
mod win_apps;
#[cfg(windows)]
pub use win::*;
#[cfg(windows)]
pub use win_apps::app_icons;
#[cfg(windows)]
mod win_time;
#[cfg(windows)]
pub use win_time::{add_local_days, add_local_month, local_weekday};

#[cfg(not(windows))]
mod fallback {
    use tauri::{AppHandle, PhysicalPosition, PhysicalSize, WebviewWindow};

    pub fn make_tool_window(_w: &WebviewWindow, _no_activate: bool) {}
    pub fn set_bounds(w: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) {
        let _ = w.set_position(PhysicalPosition::new(x, y));
        let _ = w.set_size(PhysicalSize::new(width, height));
    }
    pub fn show_inactive(w: &WebviewWindow) {
        let _ = w.show();
    }
    pub fn start_fullscreen_watcher(_app: AppHandle) {}
    pub fn fullscreen_active() -> bool {
        false
    }
    pub const APP_EVENT: &str = "context:app";
    pub fn current_app() -> Option<String> {
        None
    }
    pub fn recent_apps() -> Vec<String> {
        Vec::new()
    }
    pub fn add_local_days(ms: u64, days: u32) -> u64 {
        ms + days as u64 * 86_400_000
    }
    pub fn add_local_month(ms: u64) -> u64 {
        ms + 30 * 86_400_000
    }
    pub fn local_weekday(ms: u64) -> u16 {
        ((ms / 86_400_000 + 4) % 7) as u16
    }
    pub fn app_icons(exes: Vec<String>) -> Vec<(String, Option<String>)> {
        exes.into_iter().map(|e| (e, None)).collect()
    }
}
#[cfg(not(windows))]
pub use fallback::*;
