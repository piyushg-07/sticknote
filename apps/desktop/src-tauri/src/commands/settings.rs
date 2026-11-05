use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::{events, AppState};
use crate::store::{self, DataPaths};
use crate::{tray, windows};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

pub fn view(app: &AppHandle) -> SettingsView {
    let state = app.state::<AppState>();
    let g = state.inner.lock();
    SettingsView {
        settings: g.settings.clone(),
        start_with_windows: app.autolaunch().is_enabled().unwrap_or(false),
        portable: g.paths.portable,
        data_dir: g.paths.dir.display().to_string(),
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> SettingsView {
    view(&app)
}

/// Apply a settings patch, persist it and broadcast it to every window. Shared
/// by the settings screen, the tray menu and startup.
pub fn apply(app: &AppHandle, patch: SettingsPatch) -> AppResult<SettingsView> {
    let state = app.state::<AppState>();
    let (edge_changed, deck_changed, fullscreen_changed) = {
        let mut g = state.inner.lock();
        let before = g.settings.clone();
        let s = &mut g.settings;
        if let Some(v) = patch.theme {
            s.theme = v;
        }
        if let Some(v) = patch.edge {
            s.edge = v;
        }
        if let Some(v) = patch.hide_fullscreen {
            s.hide_fullscreen = v;
        }
        if let Some(v) = patch.sort {
            s.sort = v;
        }
        if let Some(v) = patch.show_deck {
            s.show_deck = v;
        }
        let snapshot = s.clone();
        store::save_settings(&g.paths, &snapshot)?;
        (
            before.edge != snapshot.edge,
            before.show_deck != snapshot.show_deck,
            before.hide_fullscreen != snapshot.hide_fullscreen,
        )
    };

    if let Some(on) = patch.start_with_windows {
        let al = app.autolaunch();
        let res = if on { al.enable() } else { al.disable() };
        res.map_err(|e| AppError::Other(format!("Could not change startup setting: {e}")))?;
    }

    if let Some(portable) = patch.portable {
        set_portable(app, portable)?;
    }

    if edge_changed || deck_changed {
        windows::deck::reposition(app);
    }
    if deck_changed || fullscreen_changed {
        windows::deck::refresh_visibility(app);
    }

    let v = view(app);
    tray::sync(app, &v);
    let _ = app.emit(events::SETTINGS_CHANGED, &v);
    Ok(v)
}

#[tauri::command]
pub fn update_settings(patch: SettingsPatch, app: AppHandle) -> AppResult<SettingsView> {
    apply(&app, patch)
}

/// Switch between Documents and portable storage. Data is copied (never
/// moved) so the old location stays as a backup; the app restarts to pick up
/// the new folder.
fn set_portable(app: &AppHandle, on: bool) -> AppResult<()> {
    let state = app.state::<AppState>();
    let current = state.inner.lock().paths.clone();
    if current.portable == on {
        return Ok(());
    }
    state.flush();
    let exe_dir = store::exe_dir().ok_or_else(|| AppError::Other("Cannot locate app folder".into()))?;
    let marker = exe_dir.join(store::PORTABLE_MARKER);
    if on {
        std::fs::write(&marker, b"Peekin portable mode. Delete this file to store notes in Documents.\n")
            .map_err(|_| AppError::Other("The app folder is not writable, so portable mode can't be used here".into()))?;
    } else {
        std::fs::remove_file(&marker)?;
    }
    let target = DataPaths::resolve(app.path().document_dir().ok())?;
    std::fs::create_dir_all(&target.dir)?;
    for (from, to) in [
        (current.notes(), target.notes()),
        (current.settings(), target.settings()),
    ] {
        if from.is_file() && !to.exists() {
            std::fs::copy(from, to)?;
        }
    }
    app.restart();
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: String,
    version: String,
    data_dir: String,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, state: State<AppState>) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        data_dir: state.inner.lock().paths.dir.display().to_string(),
    }
}
