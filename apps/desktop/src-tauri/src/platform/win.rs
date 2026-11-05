//! Win32 integration:
//!  * tool-window styling (no taskbar button, no Alt+Tab entry, optional
//!    no-activate so hovering/clicking the deck never steals focus)
//!  * atomic move+resize for the deck (no flicker when it grows from the edge)
//!  * an event-driven fullscreen watcher (WinEvent hooks, zero polling)

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
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
    // Shell-reported states: D3D fullscreen games, presentation mode.
    let mut quns = 0;
    if SHQueryUserNotificationState(&mut quns) >= 0 && matches!(quns, 3 | 4) {
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
    // A maximized window with a title bar is just maximized, not fullscreen
    // (it covers the whole screen when the taskbar auto-hides).
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
    if IsZoomed(hwnd) != 0 && style & WS_CAPTION == WS_CAPTION {
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
//
// Every relevant event (foreground change, minimize, restore) runs one
// `refresh()` that re-reads the *current* state from the OS instead of trusting
// the event, then a short "settle" re-check runs after the burst. Window
// transitions (restore animations, taskbar clicks, Alt+Tab) briefly report a
// null or in-between foreground window; the settle pass always lands on the
// final state, so a missed or out-of-order event can't leave the deck stale.

/// Event sent to the deck when the app in front changes (payload: exe name, or
/// null when no app is in front: desktop shown, app minimized).
pub const APP_EVENT: &str = "context:app";
const RECENT_MAX: usize = 10;
/// Transient system surfaces: while one is in front, the previous app stays.
const PASS_THROUGH_EXES: &[&str] = &[
    "searchhost.exe",
    "searchapp.exe",
    "startmenuexperiencehost.exe",
    "shellexperiencehost.exe",
    "textinputhost.exe",
    "lockapp.exe",
    "applicationframehost.exe",
];
/// Shell windows passed through the same way (taskbar, tray, task switcher).
const PASS_THROUGH_CLASSES: &[&str] = &[
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "NotifyIconOverflowWindow",
    "TopLevelWindowForOverflowXamlIsland",
    "MultitaskingViewFrame",
    "XamlExplorerHostIslandWindow",
    "ForegroundStaging",
    "TaskSwitcherWnd",
];
/// The desktop: no app in front.
const DESKTOP_CLASSES: &[&str] = &["Progman", "WorkerW"];

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

/// What the foreground window means for the deck.
enum Front {
    /// a real app: (lower-case exe name, full path)
    App(String, String),
    /// no app in front (desktop shown, or the app was minimized)
    Nothing,
    /// a transient surface, Peekin itself, or a mid-switch state: keep
    /// whatever was in front before
    Keep,
}

unsafe fn class_of(hwnd: HWND) -> String {
    let mut buf = [0u16; 64];
    let n = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

unsafe fn pid_of(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, &mut pid);
    pid
}

/// (lower-case exe name, full path) of a process.
unsafe fn query_exe(pid: u32) -> Option<(String, String)> {
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
    Some((name, path))
}

/// The last process resolved, so staying in (or returning to) the same app
/// costs no process lookup. Only ever set from a successful lookup.
static LAST_EXE: Mutex<Option<(u32, String, String)>> = Mutex::new(None);

unsafe fn exe_of_pid(pid: u32) -> Option<(String, String)> {
    if let Some((p, n, path)) = LAST_EXE.lock().as_ref() {
        if *p == pid {
            return Some((n.clone(), path.clone()));
        }
    }
    let found = query_exe(pid)?;
    *LAST_EXE.lock() = Some((pid, found.0.clone(), found.1.clone()));
    Some(found)
}

/// Store apps (WhatsApp, Telegram…) live inside an ApplicationFrameHost frame;
/// the real app is a child window owned by another process.
unsafe fn hosted_app_pid(frame: HWND) -> u32 {
    unsafe extern "system" fn find(child: HWND, lparam: isize) -> i32 {
        let out = &mut *(lparam as *mut (u32, u32));
        let pid = pid_of(child);
        if pid != 0 && pid != out.0 {
            out.1 = pid;
            return 0; // found: stop
        }
        1
    }
    let mut state = (pid_of(frame), 0u32);
    EnumChildWindows(frame, Some(find), &mut state as *mut (u32, u32) as isize);
    state.1
}

unsafe fn classify(hwnd: HWND) -> Front {
    if hwnd.is_null() || IsWindow(hwnd) == 0 {
        return Front::Keep; // focus is mid-switch; the settle pass re-checks
    }
    if IsIconic(hwnd) != 0 {
        return Front::Nothing; // the app in front was just minimized
    }
    let mut pid = pid_of(hwnd);
    if pid == 0 || pid == GetCurrentProcessId() {
        return Front::Keep; // Peekin's own note / capture windows
    }
    let class = class_of(hwnd);
    if DESKTOP_CLASSES.contains(&class.as_str()) {
        return Front::Nothing;
    }
    if PASS_THROUGH_CLASSES.contains(&class.as_str()) {
        return Front::Keep;
    }
    if class == "ApplicationFrameWindow" {
        match hosted_app_pid(hwnd) {
            0 => return Front::Keep, // still starting up; the settle pass re-checks
            p => pid = p,
        }
    }
    match exe_of_pid(pid) {
        Some((exe, _)) if PASS_THROUGH_EXES.contains(&exe.as_str()) => Front::Keep,
        Some((exe, path)) => Front::App(exe, path),
        None => Front::Keep, // a protected process we can't inspect
    }
}

fn set_front(app: Option<(String, String)>) {
    let exe = app.as_ref().map(|(e, _)| e.clone());
    {
        let mut cur = CURRENT_APP.lock();
        if *cur == exe {
            return;
        }
        *cur = exe.clone();
    }
    if let Some((name, path)) = app {
        let mut recent = RECENT_APPS.lock();
        recent.retain(|(a, _)| a != &name);
        recent.insert(0, (name, path));
        recent.truncate(RECENT_MAX);
    }
    // Straight to the deck (the only window that reacts), no broadcast.
    if let Some(app) = APP.get() {
        let _ = app.emit_to(crate::windows::deck::LABEL, APP_EVENT, exe);
    }
}

/// Re-read the foreground state from the OS and apply it.
unsafe fn refresh() {
    let fg = GetForegroundWindow();
    match classify(fg) {
        Front::App(exe, path) => set_front(Some((exe, path))),
        Front::Nothing => set_front(None),
        Front::Keep => {}
    }
    refresh_fullscreen(fg);
}

unsafe fn refresh_fullscreen(fg: HWND) {
    let now = is_fullscreen(fg);
    if FULLSCREEN.swap(now, Ordering::Relaxed) != now {
        if let Some(app) = APP.get() {
            crate::windows::deck::refresh_visibility(app);
        }
    }
}

// Settle pass: re-check shortly after a burst of events, then once more after
// window animations (restore / maximize take ~250 ms) have finished. Timers,
// hooks and refresh() all run on the watcher thread, one at a time.
const SETTLE_MS: [u32; 2] = [90, 450];
static SETTLE_TIMER: AtomicUsize = AtomicUsize::new(0);
static SETTLE_STEP: AtomicUsize = AtomicUsize::new(0);

unsafe fn schedule_settle() {
    let old = SETTLE_TIMER.swap(0, Ordering::Relaxed);
    if old != 0 {
        KillTimer(std::ptr::null_mut(), old);
    }
    SETTLE_STEP.store(0, Ordering::Relaxed);
    let id = SetTimer(std::ptr::null_mut(), 0, SETTLE_MS[0], Some(on_settle));
    SETTLE_TIMER.store(id, Ordering::Relaxed);
}

unsafe extern "system" fn on_settle(_hwnd: HWND, _msg: u32, id: usize, _time: u32) {
    KillTimer(std::ptr::null_mut(), id);
    SETTLE_TIMER.store(0, Ordering::Relaxed);
    refresh();
    let next = SETTLE_STEP.fetch_add(1, Ordering::Relaxed) + 1;
    if let Some(&ms) = SETTLE_MS.get(next) {
        let id = SetTimer(std::ptr::null_mut(), 0, ms, Some(on_settle));
        SETTLE_TIMER.store(id, Ordering::Relaxed);
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
    if event == EVENT_OBJECT_LOCATIONCHANGE {
        // The window in front moved or resized: only fullscreen can change.
        if id_object == OBJID_WINDOW && id_child == 0 && hwnd == GetForegroundWindow() {
            refresh_fullscreen(hwnd);
        }
        return;
    }
    // Focus moved, or a window was minimized / restored.
    refresh();
    schedule_settle();
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
        schedule_settle(); // the app in front may have changed while asleep
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
            refresh(); // know the app in front from the start
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
                EVENT_SYSTEM_MINIMIZESTART,
                EVENT_SYSTEM_MINIMIZEEND,
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
