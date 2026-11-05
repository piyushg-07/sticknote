//! In-memory application state plus coalesced persistence.

use crate::models::*;
use crate::store::{self, DataPaths};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub const UNDO_WINDOW: Duration = Duration::from_secs(10);
const SAVE_DELAY: Duration = Duration::from_millis(300);

pub mod events {
    pub const NOTES_CHANGED: &str = "notes:changed";
    pub const NOTES_DELETED: &str = "notes:deleted";
    pub const NOTES_RESTORED: &str = "notes:restored";
    pub const SETTINGS_CHANGED: &str = "settings:changed";
    pub const NOTE_WINDOWS: &str = "deck:note-windows";
    pub const NAVIGATE: &str = "manager:navigate";
}

pub struct Inner {
    pub paths: DataPaths,
    pub notes: Vec<Note>,
    pub settings: Settings,
    /// Recently deleted batches, restorable until their timer fires.
    pub trash: Vec<(u64, Vec<Note>)>,
}

pub struct AppState {
    pub inner: Mutex<Inner>,
    save_pending: AtomicBool,
    next_token: AtomicU64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChangedPayload {
    pub origin: Option<String>,
    pub ids: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeletedPayload {
    pub token: u64,
    pub count: usize,
    pub title: String,
}

impl AppState {
    pub fn new(paths: DataPaths) -> Self {
        let mut notes = store::load_notes(&paths);
        notes.sort_by_key(|n| n.order);
        let settings = store::load_settings(&paths);
        Self {
            inner: Mutex::new(Inner { paths, notes, settings, trash: Vec::new() }),
            save_pending: AtomicBool::new(false),
            next_token: AtomicU64::new(1),
        }
    }

    pub fn token(&self) -> u64 {
        self.next_token.fetch_add(1, Ordering::Relaxed)
    }

    /// Mark notes dirty; a single delayed task writes them once even if many
    /// edits arrive in a burst. No polling, no recurring timers.
    pub fn schedule_save(&self, app: &AppHandle) {
        if self.save_pending.swap(true, Ordering::AcqRel) {
            return;
        }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(SAVE_DELAY).await;
            let state = app.state::<AppState>();
            state.flush();
        });
    }

    /// Write notes to disk now (also used on quit).
    pub fn flush(&self) {
        self.save_pending.store(false, Ordering::Release);
        let (path, bytes) = {
            let g = self.inner.lock();
            match store::serialize_notes(&g.notes) {
                Ok(b) => (g.paths.notes(), b),
                Err(e) => {
                    log::error!("serialize failed: {e}");
                    return;
                }
            }
        };
        if let Err(e) = store::atomic_write(&path, &bytes) {
            log::error!("save failed: {e}");
        }
    }
}

pub fn emit_changed(app: &AppHandle, origin: Option<&str>, ids: Vec<String>) {
    crate::reminders::poke(app);
    let _ = app.emit(
        events::NOTES_CHANGED,
        ChangedPayload { origin: origin.map(str::to_string), ids },
    );
}
