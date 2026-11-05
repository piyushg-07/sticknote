use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::{emit_changed, events, AppState, DeletedPayload, UNDO_WINDOW};
use crate::store::clamp_chars;
use crate::{sanitize, windows};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

pub fn validate_id(id: &str) -> AppResult<()> {
    uuid::Uuid::parse_str(id)
        .map(|_| ())
        .map_err(|_| AppError::Invalid("Invalid note id".into()))
}

fn validate_ids(ids: &[String]) -> AppResult<()> {
    if ids.len() > MAX_NOTES {
        return Err(AppError::Invalid("Too many notes".into()));
    }
    ids.iter().try_for_each(|i| validate_id(i))
}

fn find<'a>(notes: &'a mut [Note], id: &str) -> AppResult<&'a mut Note> {
    notes.iter_mut().find(|n| n.id == id).ok_or(AppError::NotFound)
}

#[tauri::command]
pub fn list_notes(state: State<AppState>) -> Vec<Note> {
    state.inner.lock().notes.clone()
}

#[tauri::command]
pub fn get_note(id: String, state: State<AppState>) -> AppResult<Note> {
    validate_id(&id)?;
    let mut g = state.inner.lock();
    Ok(find(&mut g.notes, &id)?.clone())
}

/// Create a note at the top of the deck. Colour rotates so consecutive notes
/// are easy to tell apart.
pub fn create_note_inner(app: &AppHandle, origin: Option<&str>) -> AppResult<Note> {
    create_note_with(app, origin, String::new(), String::new(), None)
}

/// Create a note at the top of the deck. Colour rotates (unless given) so
/// consecutive notes are easy to tell apart.
fn create_note_with(
    app: &AppHandle,
    origin: Option<&str>,
    title: String,
    body: String,
    color: Option<u8>,
) -> AppResult<Note> {
    let state = app.state::<AppState>();
    let note = {
        let mut g = state.inner.lock();
        if g.notes.len() >= MAX_NOTES {
            return Err(AppError::Invalid("Note limit reached".into()));
        }
        let min_order = g.notes.iter().map(|n| n.order).min().unwrap_or(0);
        let color = color.unwrap_or_else(|| {
            g.notes.iter().max_by_key(|n| n.created).map(|n| (n.color + 1) % COLOR_COUNT).unwrap_or(3)
        });
        let mut note = Note::new(color, min_order - 1);
        note.title = clamp_chars(title.replace(['\n', '\r'], " ").trim(), MAX_TITLE);
        note.body = sanitize::clean_html(&body);
        note.text = sanitize::html_to_text(&note.body);
        g.notes.insert(0, note.clone());
        note
    };
    state.schedule_save(app);
    emit_changed(app, origin, vec![note.id.clone()]);
    Ok(note)
}

#[tauri::command]
pub fn create_note(app: AppHandle, window: WebviewWindow) -> AppResult<Note> {
    create_note_inner(&app, Some(window.label()))
}

#[tauri::command]
pub fn update_note(
    id: String,
    patch: NotePatch,
    app: AppHandle,
    window: WebviewWindow,
    state: State<AppState>,
) -> AppResult<Note> {
    validate_id(&id)?;
    if patch.body.as_ref().is_some_and(|b| b.len() > MAX_BODY) {
        return Err(AppError::Invalid("Note is too long".into()));
    }
    let note = {
        let mut g = state.inner.lock();
        let n = find(&mut g.notes, &id)?;
        let mut changed = false;
        if let Some(t) = patch.title {
            let t = clamp_chars(t.replace(['\n', '\r'], " ").trim_start(), MAX_TITLE);
            if t != n.title {
                n.title = t;
                changed = true;
            }
        }
        if let Some(b) = patch.body {
            let clean = sanitize::clean_html(&b);
            if clean != n.body {
                n.text = sanitize::html_to_text(&clean);
                n.body = clean;
                changed = true;
            }
        }
        if changed {
            n.updated = now_ms();
        }
        (n.clone(), changed)
    };
    if note.1 {
        state.schedule_save(&app);
        emit_changed(&app, Some(window.label()), vec![id]);
    }
    Ok(note.0)
}

fn mutate(
    app: &AppHandle,
    origin: Option<&str>,
    ids: Vec<String>,
    f: impl Fn(&mut Note),
) -> AppResult<()> {
    validate_ids(&ids)?;
    let state = app.state::<AppState>();
    {
        let mut g = state.inner.lock();
        for id in &ids {
            if let Ok(n) = find(&mut g.notes, id) {
                f(n);
            }
        }
    }
    state.schedule_save(app);
    emit_changed(app, origin, ids);
    Ok(())
}

#[tauri::command]
pub fn set_color(id: String, color: u8, app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    if color >= COLOR_COUNT {
        return Err(AppError::Invalid("Unknown colour".into()));
    }
    mutate(&app, Some(window.label()), vec![id], |n| {
        n.color = color;
        n.updated = now_ms();
    })
}

#[tauri::command]
pub fn cycle_color(id: String, app: AppHandle, window: WebviewWindow) -> AppResult<u8> {
    validate_id(&id)?;
    let next = {
        let state = app.state::<AppState>();
        let mut g = state.inner.lock();
        (find(&mut g.notes, &id)?.color + 1) % COLOR_COUNT
    };
    set_color(id, next, app, window)?;
    Ok(next)
}

#[tauri::command]
pub fn set_font(id: String, font: NoteFont, app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    mutate(&app, Some(window.label()), vec![id], |n| n.font = font)
}

#[tauri::command]
pub fn set_status(ids: Vec<String>, status: Status, app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    let closing = ids.clone();
    mutate(&app, Some(window.label()), ids, |n| {
        n.status = status;
        if status == Status::Active {
            n.on_deck = true;
        }
        n.updated = now_ms();
    })?;
    if status == Status::Archived {
        for id in closing {
            windows::note::close(&app, &id);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn set_on_deck(id: String, on_deck: bool, app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    mutate(&app, Some(window.label()), vec![id], |n| n.on_deck = on_deck)
}

pub fn delete_inner(app: &AppHandle, ids: Vec<String>) -> AppResult<DeletedPayload> {
    validate_ids(&ids)?;
    let state = app.state::<AppState>();
    let token = state.token();
    let removed: Vec<Note> = {
        let mut g = state.inner.lock();
        let (gone, keep): (Vec<Note>, Vec<Note>) =
            std::mem::take(&mut g.notes).into_iter().partition(|n| ids.contains(&n.id));
        g.notes = keep;
        if !gone.is_empty() {
            g.trash.push((token, gone.clone()));
        }
        gone
    };
    if removed.is_empty() {
        return Err(AppError::NotFound);
    }
    for n in &removed {
        windows::note::close(app, &n.id);
    }
    state.schedule_save(app);
    emit_changed(app, None, ids);

    // One-shot purge after the undo window elapses.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(UNDO_WINDOW).await;
        handle.state::<AppState>().inner.lock().trash.retain(|(t, _)| *t != token);
    });

    let payload = DeletedPayload {
        token,
        count: removed.len(),
        title: removed
            .first()
            .map(|n| if n.title.is_empty() { "Untitled".into() } else { n.title.clone() })
            .unwrap_or_default(),
    };
    let _ = app.emit(events::NOTES_DELETED, payload.clone());
    Ok(payload)
}

#[tauri::command]
pub fn delete_notes(ids: Vec<String>, app: AppHandle) -> AppResult<DeletedPayload> {
    delete_inner(&app, ids)
}

/// Restore a deleted batch. `token = 0` means "the most recent one".
#[tauri::command]
pub fn undo_delete(token: u64, app: AppHandle, state: State<AppState>) -> AppResult<Vec<String>> {
    let restored = {
        let mut g = state.inner.lock();
        let pos = if token == 0 {
            g.trash.len().checked_sub(1)
        } else {
            g.trash.iter().position(|(t, _)| *t == token)
        };
        match pos {
            Some(p) => {
                let (tok, notes) = g.trash.remove(p);
                let ids: Vec<String> = notes.iter().map(|n| n.id.clone()).collect();
                g.notes.extend(notes);
                g.notes.sort_by_key(|n| n.order);
                Some((tok, ids))
            }
            None => None,
        }
    };
    let Some((tok, ids)) = restored else {
        return Err(AppError::Invalid("Nothing to undo".into()));
    };
    state.schedule_save(&app);
    emit_changed(&app, None, ids.clone());
    let _ = app.emit(events::NOTES_RESTORED, tok);
    Ok(ids)
}

/// Reorder: the given ids take over the order slots they currently occupy,
/// in the given sequence. Works for the deck subset and full lists alike.
#[tauri::command]
pub fn reorder_notes(ids: Vec<String>, app: AppHandle, window: WebviewWindow, state: State<AppState>) -> AppResult<()> {
    validate_ids(&ids)?;
    {
        let mut g = state.inner.lock();
        let mut slots: Vec<i64> = g
            .notes
            .iter()
            .filter(|n| ids.contains(&n.id))
            .map(|n| n.order)
            .collect();
        slots.sort_unstable();
        slots.dedup();
        // If duplicates collapsed slots, renumber everything first.
        if slots.len() != ids.len() {
            g.notes.sort_by_key(|n| n.order);
            for (i, n) in g.notes.iter_mut().enumerate() {
                n.order = i as i64;
            }
            slots = g.notes.iter().filter(|n| ids.contains(&n.id)).map(|n| n.order).collect();
            slots.sort_unstable();
        }
        for (id, slot) in ids.iter().zip(slots) {
            if let Some(n) = g.notes.iter_mut().find(|n| &n.id == id) {
                n.order = slot;
            }
        }
        g.notes.sort_by_key(|n| n.order);
    }
    state.schedule_save(&app);
    emit_changed(&app, Some(window.label()), ids);
    Ok(())
}

#[tauri::command]
pub fn save_note_bounds(id: String, bounds: Bounds, app: AppHandle, state: State<AppState>) -> AppResult<()> {
    validate_id(&id)?;
    if bounds.w < 200 || bounds.h < 160 || bounds.w > 4000 || bounds.h > 4000 {
        return Ok(());
    }
    {
        let mut g = state.inner.lock();
        find(&mut g.notes, &id)?.bounds = Some(bounds);
    }
    state.schedule_save(&app);
    Ok(())
}


/// Quick capture: the first line becomes the title, the rest the body.
#[tauri::command]
pub fn quick_note(text: String, color: Option<u8>, app: AppHandle, window: WebviewWindow) -> AppResult<Note> {
    if text.len() > MAX_BODY {
        return Err(AppError::Invalid("Note is too long".into()));
    }
    if color.is_some_and(|c| c >= COLOR_COUNT) {
        return Err(AppError::Invalid("Unknown colour".into()));
    }
    let text = text.trim();
    let mut lines = text.lines();
    let title = lines.next().unwrap_or("").to_string();
    let body: String = lines
        .map(|l| if l.trim().is_empty() { "<div><br></div>".to_string() } else { format!("<div>{}</div>", escape_html(l)) })
        .collect();
    create_note_with(&app, Some(window.label()), title, body, color)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Set (Some) or clear (None) a note's reminder, optionally repeating.
#[tauri::command]
pub fn set_reminder(
    id: String,
    at: Option<u64>,
    repeat: Option<Repeat>,
    app: AppHandle,
    window: WebviewWindow,
) -> AppResult<()> {
    if at.is_some_and(|t| !valid_remind_at(t)) {
        return Err(AppError::Invalid("Pick a time in the future".into()));
    }
    mutate(&app, Some(window.label()), vec![id], |n| {
        n.remind_at = at;
        n.repeat = at.and(repeat); // no time, no repeat
        n.alert = false;
    })
}

/// The user has seen a fired reminder.
#[tauri::command]
pub fn clear_alert(id: String, app: AppHandle) -> AppResult<()> {
    validate_id(&id)?;
    clear_alert_inner(&app, &id);
    Ok(())
}

pub fn clear_alert_inner(app: &AppHandle, id: &str) {
    let changed = {
        let state = app.state::<AppState>();
        let mut g = state.inner.lock();
        match g.notes.iter_mut().find(|n| n.id == id && n.alert) {
            Some(n) => {
                n.alert = false;
                true
            }
            None => false,
        }
    };
    if changed {
        app.state::<AppState>().schedule_save(app);
        emit_changed(app, None, vec![id.to_string()]);
    }
}

/// Tie a note to up to 5 apps (shown on the deck only while one of them is
/// in front). An empty list means every app.
#[tauri::command]
pub fn set_note_apps(id: String, apps: Vec<String>, app: AppHandle, window: WebviewWindow) -> AppResult<()> {
    if apps.len() > MAX_APPS {
        return Err(AppError::Invalid(format!("Pick up to {MAX_APPS} apps")));
    }
    let mut list: Vec<String> = Vec::new();
    for a in apps {
        let a = a.to_ascii_lowercase();
        if !valid_app(&a) {
            return Err(AppError::Invalid("Unknown app".into()));
        }
        if !list.contains(&a) {
            list.push(a);
        }
    }
    mutate(&app, Some(window.label()), vec![id], move |n| n.apps = list.clone())
}
