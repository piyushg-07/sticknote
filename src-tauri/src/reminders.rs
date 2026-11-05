//! Reminders: one sleeping task that wakes only when the next reminder is due
//! (or when notes change and the next due time might be different).
//!
//! When a reminder fires the note gets `alert = true`, the deck pops its card
//! out (`reminder:fired`) and Windows shows a notification.

use crate::models::{now_ms, Repeat, Status};
use crate::platform;
use crate::state::{emit_changed, AppState};
use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Notify;

pub const FIRED_EVENT: &str = "reminder:fired";
/// Re-check at least this often so a changed system clock or a PC waking
/// from sleep is noticed (only while a reminder is actually pending).
const MAX_SLEEP: Duration = Duration::from_secs(300);
/// At startup, give the deck a moment to load so it can pop the card out.
const STARTUP_DELAY: Duration = Duration::from_secs(4);
/// A reminder firing this late counts as "missed" (PC was off or asleep).
const MISSED_AFTER_MS: u64 = 2 * 60_000;

struct Wake(Notify);

#[derive(Serialize, Clone)]
struct Fired {
    id: String,
    title: String,
    /// When it was due (ms); with `missed`, the UI can say "Missed · 9:00 AM".
    due: u64,
    /// Due a while ago: the PC was off/asleep or Peekin wasn't running.
    missed: bool,
}

/// The next occurrence of a repeating reminder strictly after `now`.
/// Occurrences missed while the PC was off are skipped (it fires once).
pub fn next_occurrence(at: u64, repeat: Repeat, now: u64) -> u64 {
    let step = |t: u64| match repeat {
        Repeat::Daily => platform::add_local_days(t, 1),
        Repeat::Weekly => platform::add_local_days(t, 7),
        Repeat::Monthly => platform::add_local_month(t),
        Repeat::Weekdays => {
            let mut n = platform::add_local_days(t, 1);
            while matches!(platform::local_weekday(n), 0 | 6) {
                n = platform::add_local_days(n, 1);
            }
            n
        }
    };
    let mut t = at;
    for _ in 0..5000 {
        t = step(t);
        if t > now {
            return t;
        }
    }
    now + 86_400_000 // unreachable in practice; never loop forever
}

/// Something changed that may affect the next due time.
pub fn poke(app: &AppHandle) {
    if let Some(w) = app.try_state::<Wake>() {
        w.0.notify_one();
    }
}

pub fn start(app: &AppHandle) {
    app.manage(Wake(Notify::new()));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(STARTUP_DELAY).await;
        loop {
            let next = {
                let state = app.state::<AppState>();
                let g = state.inner.lock();
                g.notes
                    .iter()
                    .filter(|n| n.status == Status::Active)
                    .filter_map(|n| n.remind_at)
                    .min()
            };
            let wake_state = app.state::<Wake>();
            let wake = &wake_state.0;
            match next {
                None => wake.notified().await,
                Some(at) => {
                    let now = now_ms();
                    if at <= now {
                        fire_due(&app);
                        continue;
                    }
                    let wait = Duration::from_millis(at - now).min(MAX_SLEEP);
                    tokio::select! {
                        _ = tokio::time::sleep(wait) => {}
                        _ = wake.notified() => {}
                    }
                }
            }
        }
    });
}

fn fire_due(app: &AppHandle) {
    let now = now_ms();
    let fired: Vec<Fired> = {
        let state = app.state::<AppState>();
        let mut g = state.inner.lock();
        g.notes
            .iter_mut()
            .filter(|n| n.status == Status::Active && n.remind_at.is_some_and(|t| t <= now))
            .map(|n| {
                let due = n.remind_at.unwrap_or(now);
                // Repeating: schedule the next one; otherwise it's done.
                n.remind_at = n.repeat.map(|r| next_occurrence(due, r, now));
                n.alert = true;
                Fired {
                    id: n.id.clone(),
                    title: if n.title.is_empty() { first_line(&n.text) } else { n.title.clone() },
                    due,
                    missed: now.saturating_sub(due) > MISSED_AFTER_MS,
                }
            })
            .collect()
    };
    if fired.is_empty() {
        return;
    }
    app.state::<AppState>().schedule_save(app);
    emit_changed(app, None, fired.iter().map(|f| f.id.clone()).collect());
    for f in fired {
        let _ = app
            .notification()
            .builder()
            .title(if f.missed { "Missed reminder" } else { "Reminder" })
            .body(if f.title.is_empty() { "A note needs your attention" } else { &f.title })
            .show();
        let _ = app.emit(FIRED_EVENT, f);
    }
}

fn first_line(text: &str) -> String {
    text.lines().find(|l| !l.trim().is_empty()).unwrap_or("").chars().take(80).collect()
}
