//! Quick capture: a small sticky-note card beside the deck for jotting a
//! thought without opening a full note. It is created hidden at startup and
//! only shown/hidden afterwards, so it appears instantly.

use super::primary_work_area;
use crate::models::Edge;
use crate::platform;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "capture";
const SHOW_EVENT: &str = "capture:show";
/// Logical size: a 380×200 card plus a 12px transparent margin for its shadow.
const W: f64 = 404.0;
const H: f64 = 224.0;
/// Gap between the card and the screen edge (clears the deck's tabs).
const EDGE_GAP: f64 = 58.0;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Peekin quick note")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .inner_size(W, H)
        .focused(false)
        .visible(false)
        .build()?;
    platform::make_tool_window(&w, false);
    Ok(())
}

/// Show the capture card beside the deck, vertically centred, and focus it.
pub fn show(app: &AppHandle) {
    if app.get_webview_window(LABEL).is_none() && create(app).is_err() {
        return;
    }
    let Some(w) = app.get_webview_window(LABEL) else { return };
    let edge = app.state::<AppState>().inner.lock().settings.edge;
    let wa = primary_work_area(app);
    let (pw, ph) = ((W * wa.scale) as i32, (H * wa.scale) as i32);
    let gap = (EDGE_GAP * wa.scale) as i32;
    let x = match edge {
        Edge::Right => wa.x + wa.w as i32 - pw - gap,
        Edge::Left => wa.x + gap,
    };
    let y = wa.y + (wa.h as i32 - ph) / 2;
    let _ = w.set_position(PhysicalPosition::new(x, y));
    let _ = w.show();
    platform::make_tool_window(&w, false); // tao re-applies styles on show
    let _ = w.set_focus();
    let _ = w.emit_to(LABEL, SHOW_EVENT, edge);
}
