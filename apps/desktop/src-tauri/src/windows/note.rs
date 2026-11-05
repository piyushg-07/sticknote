//! One floating window per note.
//!
//! Opening a note must feel instant, but creating a webview takes a few
//! hundred milliseconds. So one hidden, fully loaded "spare" note window is
//! kept ready (`note-pool-N`). Opening a note *binds* the spare to that note
//! (the page receives the id, paints, then asks to be revealed) and a new
//! spare is prepared in the background. Closing a note destroys its window,
//! so memory stays bounded: open notes + one spare.

use super::primary_work_area;
use crate::platform;
use crate::state::events;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const PREFIX: &str = "note-";
const POOL_PREFIX: &str = "note-pool-";
/// Event telling a spare window which note it now shows.
const BIND_EVENT: &str = "note:bind";
/// Event telling a hidden note window it is being shown again.
const SHOWN_EVENT: &str = "note:shown";
/// Default size of every note window (logical px): a 490×560 note plus the
/// 8px transparent margin around it that holds its shadow. Tall enough for
/// the reminder panel to open inside it without scrolling.
const DEFAULT_W: f64 = 506.0;
const DEFAULT_H: f64 = 576.0;
const CASCADE: f64 = 28.0; // offset for each additional open note
/// Wait before preparing the next spare, so it never competes with the
/// note that is opening right now.
const PREWARM_DELAY: Duration = Duration::from_millis(700);
/// Show a bound window even if its page never reports ready (safety net).
const REVEAL_FALLBACK: Duration = Duration::from_millis(1500);

#[derive(serde::Serialize, Clone)]
struct BindPayload<'a> {
    /// The window this is meant for; other note windows ignore it.
    label: &'a str,
    id: &'a str,
}

static SEQ: AtomicU32 = AtomicU32::new(1);
/// (window label, note id) for every window currently showing a note.
static BINDINGS: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());

/// Note id shown by the window `label`, if any.
pub fn id_for(label: &str) -> Option<String> {
    BINDINGS.lock().iter().find(|(l, _)| l == label).map(|(_, id)| id.clone())
}

fn label_for(id: &str) -> Option<String> {
    BINDINGS.lock().iter().find(|(_, i)| i == id).map(|(l, _)| l.clone())
}

pub fn open_ids(_app: &AppHandle) -> Vec<String> {
    BINDINGS.lock().iter().map(|(_, id)| id.clone()).collect()
}

fn broadcast(app: &AppHandle) {
    let _ = app.emit(events::NOTE_WINDOWS, open_ids(app));
}

/// Centred on the primary work area at the default size; each additional
/// open note is offset a little so they never stack exactly. Physical px.
fn centered_rect(app: &AppHandle) -> (i32, i32, u32, u32) {
    let wa = primary_work_area(app);
    let s = wa.scale;
    let pw = ((DEFAULT_W * s) as u32).min(wa.w);
    let ph = ((DEFAULT_H * s) as u32).min(wa.h);
    let step = (CASCADE * s) as i32 * (BINDINGS.lock().len() as i32 % 6);
    let x = (wa.x + (wa.w as i32 - pw as i32) / 2 + step).clamp(wa.x, wa.x + wa.w as i32 - pw as i32);
    let y = (wa.y + (wa.h as i32 - ph as i32) / 2 + step).clamp(wa.y, wa.y + wa.h as i32 - ph as i32);
    (x, y, pw, ph)
}

fn build(app: &AppHandle, label: &str) -> tauri::Result<tauri::WebviewWindow> {
    let w = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Peekin note")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        // No edge resizing: notes resize only from the corner grip (note/main.ts).
        .resizable(false)
        .maximizable(false)
        .min_inner_size(340.0, 260.0)
        .inner_size(DEFAULT_W, DEFAULT_H)
        .visible(false)
        .build()?;
    platform::make_tool_window(&w, false);
    Ok(w)
}

/// A loaded spare window that isn't showing a note yet.
fn free_spare(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let bound = BINDINGS.lock();
    app.webview_windows()
        .into_iter()
        .find(|(l, _)| l.starts_with(POOL_PREFIX) && !bound.iter().any(|(b, _)| b == l))
        .map(|(_, w)| w)
}

/// Make sure one spare note window is loaded and waiting.
pub fn prewarm(app: &AppHandle) {
    if free_spare(app).is_some() {
        return;
    }
    let label = format!("{POOL_PREFIX}{}", SEQ.fetch_add(1, Ordering::Relaxed));
    if let Err(e) = build(app, &label) {
        log::warn!("could not prepare a note window: {e}");
    }
}

fn prewarm_later(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PREWARM_DELAY).await;
        prewarm(&handle);
    });
}

/// Open (or bring back) the window for note `id`, centred on screen.
pub fn open(app: &AppHandle, id: &str, _anchor_y: Option<f64>) -> tauri::Result<()> {
    crate::commands::notes::clear_alert_inner(app, id); // opening a note acknowledges its reminder
    // Already open (possibly hidden with "—"): show it again.
    if let Some(w) = label_for(id).and_then(|l| app.get_webview_window(&l)) {
        let _ = w.unminimize();
        let was_hidden = !w.is_visible().unwrap_or(true);
        reveal(&w);
        if was_hidden {
            let _ = w.emit_to(w.label(), SHOWN_EVENT, w.label());
        }
        return Ok(());
    }

    // Use the waiting spare (instant) or, if none is ready, build one now.
    let w = match free_spare(app) {
        Some(w) => w,
        None => build(app, &format!("{POOL_PREFIX}{}", SEQ.fetch_add(1, Ordering::Relaxed)))?,
    };
    let label = w.label().to_string();
    BINDINGS.lock().push((label.clone(), id.to_string()));

    let (x, y, pw, ph) = centered_rect(app);
    let _ = w.set_position(PhysicalPosition::new(x, y));
    let _ = w.set_size(PhysicalSize::new(pw, ph));
    // A loaded spare picks this up at once; a fresh window asks for its id
    // with `note_id` when its page boots.
    let _ = w.emit_to(&label, BIND_EVENT, BindPayload { label: &label, id });
    broadcast(app);

    // The page calls `note_ready` after painting; show it anyway if that
    // never happens.
    let handle = app.clone();
    let fallback_label = label.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(REVEAL_FALLBACK).await;
        if let Some(w) = handle.get_webview_window(&fallback_label) {
            if id_for(&fallback_label).is_some() && !w.is_visible().unwrap_or(true) {
                reveal(&w);
            }
        }
    });

    prewarm_later(app);
    Ok(())
}

/// Show a note window, keep it out of the taskbar/Alt+Tab, and focus it.
pub fn reveal(w: &tauri::WebviewWindow) {
    platform::make_tool_window(w, false);
    let _ = w.show();
    // tao re-applies its own styles on show, so make it a tool window after too.
    platform::make_tool_window(w, false);
    let _ = w.set_focus();
}

/// Destroy the note's window (freeing its webview).
pub fn close(app: &AppHandle, id: &str) {
    if let Some(w) = label_for(id).and_then(|l| app.get_webview_window(&l)) {
        let _ = w.destroy();
    }
}

/// Global window-destroyed hook: forget the binding and tell the deck.
pub fn on_destroyed(app: &AppHandle, label: &str) {
    let removed = {
        let mut b = BINDINGS.lock();
        let before = b.len();
        b.retain(|(l, _)| l != label);
        before != b.len()
    };
    if removed {
        broadcast(app);
    }
}
