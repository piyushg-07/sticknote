//! The deck: a transparent, always-on-top strip of note tabs pinned to one
//! edge of the primary monitor. The webview reports the size it needs
//! (collapsed tabs vs. an expanded peek card) and we anchor it to the edge.

use super::primary_work_area;
use crate::models::Edge;
use crate::platform;
use crate::state::AppState;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "deck";

static SIZE: Mutex<(f64, f64)> = Mutex::new((48.0, 120.0));
static READY: AtomicBool = AtomicBool::new(false);

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Peekin deck")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .focused(false)
        .visible(false)
        .inner_size(48.0, 120.0)
        .build()?;
    platform::make_tool_window(&w, true);
    Ok(())
}

/// Anchor the deck to the configured edge, vertically centred.
pub fn reposition(app: &AppHandle) {
    let Some(w) = app.get_webview_window(LABEL) else { return };
    let edge = app.state::<AppState>().inner.lock().settings.edge;
    let wa = primary_work_area(app);
    let (lw, lh) = *SIZE.lock();
    let pw = (lw * wa.scale).round() as u32;
    let ph = ((lh * wa.scale).round() as u32).min(wa.h);
    let x = match edge {
        Edge::Right => wa.x + wa.w as i32 - pw as i32,
        Edge::Left => wa.x,
    };
    let y = wa.y + (wa.h as i32 - ph as i32) / 2;
    platform::set_bounds(&w, x, y, pw, ph);
}

/// Called by the deck webview whenever its content size changes.
pub fn resize(app: &AppHandle, width: f64, height: f64) {
    let wa = primary_work_area(app);
    let max_h = wa.h as f64 / wa.scale;
    *SIZE.lock() = (width.clamp(16.0, 640.0), height.clamp(40.0, max_h));
    reposition(app);
    if !READY.swap(true, Ordering::AcqRel) {
        refresh_visibility(app);
    }
}

/// Show or hide the deck based on settings and fullscreen state.
pub fn refresh_visibility(app: &AppHandle) {
    let Some(w) = app.get_webview_window(LABEL) else { return };
    if !READY.load(Ordering::Acquire) {
        return;
    }
    let (show_deck, hide_fs) = {
        let state = app.state::<AppState>();
        let g = state.inner.lock();
        (g.settings.show_deck, g.settings.hide_fullscreen)
    };
    let visible = show_deck && !(hide_fs && platform::fullscreen_active());
    if visible {
        platform::show_inactive(&w);
    } else {
        let _ = w.hide();
    }
}
