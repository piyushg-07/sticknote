//! The "All notes" manager window: sidebar, list, detail, settings, about.

use crate::state::events;
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "manager";
const VIEWS: &[&str] = &["all", "deck", "archive", "settings", "about"];

static INITIAL_VIEW: Mutex<Option<String>> = Mutex::new(None);

pub fn sanitize_view(view: Option<&str>) -> Option<String> {
    view.filter(|v| VIEWS.contains(v)).map(str::to_string)
}

pub fn open(app: &AppHandle, view: Option<&str>) -> tauri::Result<()> {
    let view = sanitize_view(view);
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Some(v) = view {
            let _ = app.emit_to(LABEL, events::NAVIGATE, v);
        }
        return Ok(());
    }
    *INITIAL_VIEW.lock() = view;
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("manager.html".into()))
        .title("Peekin")
        .decorations(false)
        .shadow(true)
        .inner_size(1080.0, 700.0)
        .min_inner_size(780.0, 520.0)
        .center()
        .visible(false) // shown by the page after first paint: no white flash
        .build()?;
    Ok(())
}

pub fn take_initial_view() -> Option<String> {
    INITIAL_VIEW.lock().take()
}
