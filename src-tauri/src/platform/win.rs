//! Win32 integration:
//!  * tool-window styling (no taskbar button, no Alt+Tab entry, optional
//!    no-activate so hovering/clicking the deck never steals focus)
//!  * atomic move+resize for the deck (no flicker when it grows from the edge)
//!  * an event-driven fullscreen watcher (WinEvent hooks, zero polling)

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, WebviewWindow};
use parking_lot::Mutex;
use tauri::Emitter;
use windows_sys::Win32::Foundation::{CloseHandle, HWND, RECT};
use windows_sys::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Accessibility::{SetWinEventHook, HWINEVENTHOOK};
use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

fn hwnd_of(w: &WebviewWindow) -> Option<HWND> {
    w.hwnd().ok().map(|h| h.0 as HWND)
}

/// Hide a window from the taskbar and Alt+Tab. With `no_activate`, clicks
/// don't activate it (used for the deck).
pub fn make_tool_window(w: &WebviewWindow, no_activate: bool) {
    let Some(hwnd) = hwnd_of(w) else { return };
    unsafe {
        let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        ex |= WS_EX_TOOLWINDOW;
        ex &= !WS_EX_APPWINDOW;
        if no_activate {
            ex |= WS_EX_NOACTIVATE;
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}

/// Move and resize in one call so an edge-anchored window never visibly jumps.
pub fn set_bounds(w: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) {
    let Some(hwnd) = hwnd_of(w) else { return };
    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            y,
            width as i32,
            height as i32,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        );
    }
}

/// Show without activating (the deck must never steal focus).
pub fn show_inactive(w: &WebviewWindow) {
    let Some(hwnd) = hwnd_of(w) else { return };
    unsafe {
        ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static FULLSCREEN: AtomicBool = AtomicBool::new(false);

pub fn fullscreen_active() -> bool {
    FULLSCREEN.load(Ordering::Relaxed)
}

/// Is `hwnd` a foreign window covering its whole (primary) monitor, or is the
/// shell reporting presentation / D3D fullscreen mode?
unsafe fn is_fullscreen(hwnd: HWND) -> bool {
    // Shell-reported states: games, presentations, "busy" fullscreen apps.
    let mut quns = 0;
    if SHQueryUserNotificationState(&mut quns) >= 0 && matches!(quns, 2 | 3 | 4) {
        return true;
    }
    if hwnd.is_null() || hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
        return false;
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == GetCurrentProcessId() {
        return false;
    }
    let mut class = [0u16; 32];
    let n = GetClassNameW(hwnd, class.as_mut_ptr(), class.len() as i32);
    let class = String::from_utf16_lossy(&class[..n.max(0) as usize]);
    if matches!(class.as_str(), "WorkerW" | "Progman" | "Shell_TrayWnd") {
        return false;
    }
    if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
        return false;
    }
    let mut r: RECT = std::mem::zeroed();
    if GetWindowRect(hwnd, &mut r) == 0 {
        return false;
    }
    let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut mi: MONITORINFO = std::mem::zeroed();
    mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    if GetMonitorInfoW(mon, &mut mi) == 0 {
        return false;
    }
    // Only the primary monitor hosts the deck.
    if mi.dwFlags & 1 == 0 {
        return false;
    }
    let m = mi.rcMonitor;
    r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
}

// ---- foreground app (for notes bound to an app) -------------------------------
/// Event sent to the webviews when the app in front changes (payload: exe name).
pub const APP_EVENT: &str = "context:app";
const RECENT_MAX: usize = 10;
/// Transient system surfaces that shouldn't count as "the app in front".
const IGNORED: &[&str] = &[
    "searchhost.exe",
    "searchapp.exe",
    "startmenuexperiencehost.exe",
    "shellexperiencehost.exe",
    "textinputhost.exe",
    "lockapp.exe",
    "applicationframehost.exe",
];

static CURRENT_APP: Mutex<Option<String>> = Mutex::new(None);
/// Recently-in-front apps as (exe name, full path), most recent first.
static RECENT_APPS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

/// Lower-case exe name of the app in front (never Peekin itself).
pub fn current_app() -> Option<String> {
    CURRENT_APP.lock().clone()
}

/// Apps recently in front, most recent first.
pub fn recent_apps() -> Vec<String> {
    RECENT_APPS.lock().iter().map(|(n, _)| n.clone()).collect()
}

/// Full paths of recently used apps, most recent first.
pub(super) fn recent_app_paths() -> Vec<(String, String)> {
    RECENT_APPS.lock().clone()
}

/// (lower-case exe name, full path) of the process owning `hwnd`; None for
/// Peekin itself and transient system surfaces.
pub(super) unsafe fn exe_of(hwnd: HWND) -> Option<(String, String)> {
    if hwnd.is_null() {
        return None;
    }
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    if pid == 0 || pid == GetCurrentProcessId() {
        return None;
    }
    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if process.is_null() {
        return None;
    }
    let mut buf = [0u16; 520];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
    CloseHandle(process);
    if ok == 0 {
        return None;
    }
    let path = String::from_utf16_lossy(&buf[..len as usize]);
    let name = std::path::Path::new(&path).file_name()?.to_string_lossy().to_ascii_lowercase();
    (!IGNORED.contains(&name.as_str())).then_some((name, path))
}

unsafe fn track_foreground(hwnd: HWND) {
    let Some((exe, path)) = exe_of(hwnd) else { return };
    {
        let mut cur = CURRENT_APP.lock();
        if cur.as_deref() == Some(exe.as_str()) {
            return;
        }
        *cur = Some(exe.clone());
    }
    {
        let mut recent = RECENT_APPS.lock();
        recent.retain(|(a, _)| a != &exe);
        recent.insert(0, (exe.clone(), path));
        recent.truncate(RECENT_MAX);
    }
    if let Some(app) = APP.get() {
        let _ = app.emit(APP_EVENT, exe);
    }
}

unsafe extern "system" fn on_win_event(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    id_child: i32,
    _thread: u32,
    _time: u32,
) {
    if event == EVENT_OBJECT_LOCATIONCHANGE
        && (id_object != OBJID_WINDOW || id_child != 0 || hwnd != GetForegroundWindow())
    {
        return;
    }
    let fg = GetForegroundWindow();
    if event == EVENT_SYSTEM_FOREGROUND {
        track_foreground(fg);
    }
    let now = is_fullscreen(fg);
    if FULLSCREEN.swap(now, Ordering::Relaxed) != now {
        if let Some(app) = APP.get() {
            crate::windows::deck::refresh_visibility(app);
        }
    }
}

/// Install out-of-context WinEvent hooks on a dedicated message-loop thread.
/// The thread sleeps in `GetMessageW` and only wakes on real events.
// ---- system wake-ups (for reminders) ------------------------------------------------
// Broadcasts like WM_POWERBROADCAST only reach top-level windows, so a hidden
// (never shown) top-level window on the watcher thread receives them.

unsafe extern "system" fn power_wndproc(hwnd: HWND, msg: u32, wparam: usize, lparam: isize) -> isize {
    let resumed = msg == WM_POWERBROADCAST
        && (wparam == PBT_APMRESUMEAUTOMATIC as usize || wparam == PBT_APMRESUMESUSPEND as usize);
    if resumed || msg == WM_TIMECHANGE {
        if let Some(app) = APP.get() {
            crate::reminders::poke(app); // re-check: fire anything that came due while asleep
        }
    }
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

unsafe fn create_power_listener() {
    let class: Vec<u16> = "PeekinPowerListener".encode_utf16().chain(Some(0)).collect();
    let hinstance = GetModuleHandleW(std::ptr::null());
    let wc = WNDCLASSW {
        lpfnWndProc: Some(power_wndproc),
        hInstance: hinstance,
        lpszClassName: class.as_ptr(),
        ..std::mem::zeroed()
    };
    RegisterClassW(&wc);
    CreateWindowExW(
        WS_EX_TOOLWINDOW,
        class.as_ptr(),
        class.as_ptr(),
        WS_POPUP,
        0,
        0,
        0,
        0,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
        hinstance,
        std::ptr::null(),
    );
}

pub fn start_fullscreen_watcher(app: AppHandle) {
    if APP.set(app).is_err() {
        return;
    }
    std::thread::Builder::new()
        .name("fullscreen-watch".into())
        .spawn(|| unsafe {
            track_foreground(GetForegroundWindow()); // know the app in front from the start
            create_power_listener(); // wake from sleep / clock change → reminders re-check
            let flags = WINEVENT_OUTOFCONTEXT;
            SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                std::ptr::null_mut(),
                Some(on_win_event),
                0,
                0,
                flags,
            );
            SetWinEventHook(
                EVENT_OBJECT_LOCATIONCHANGE,
                EVENT_OBJECT_LOCATIONCHANGE,
                std::ptr::null_mut(),
                Some(on_win_event),
                0,
                0,
                flags,
            );
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        })
        .ok();
}
