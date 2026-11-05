use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::state::AppState;
use crate::store;
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Json,
    Markdown,
}

/// Export through a native save dialog. The webview never sees or chooses a
/// raw path, so it can't be tricked into writing arbitrary files.
#[tauri::command]
pub async fn export_notes(
    format: ExportFormat,
    ids: Option<Vec<String>>,
    app: AppHandle,
) -> AppResult<bool> {
    let notes: Vec<Note> = {
        let state = app.state::<AppState>();
        let g = state.inner.lock();
        match &ids {
            Some(ids) if !ids.is_empty() => g.notes.iter().filter(|n| ids.contains(&n.id)).cloned().collect(),
            _ => g.notes.clone(),
        }
    };
    let (ext, name, bytes) = match format {
        ExportFormat::Json => ("json", "peekin-notes.json", store::serialize_notes(&notes)?),
        ExportFormat::Markdown => ("md", "peekin-notes.md", store::to_markdown(&notes).into_bytes()),
    };
    let path = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter(if ext == "json" { "Peekin notes" } else { "Markdown" }, &[ext])
        .blocking_save_file();
    let Some(path) = path.and_then(|p| p.into_path().ok()) else {
        return Ok(false);
    };
    store::atomic_write(&path, &bytes)?;
    Ok(true)
}

/// Open a link from a note in the default browser. Only web and mail links
/// are allowed; everything else (file:, javascript:, custom protocols) is
/// refused.
#[tauri::command]
pub fn open_link(url: String, app: AppHandle) -> AppResult<()> {
    let parsed = url::Url::parse(&url).map_err(|_| AppError::Invalid("Not a valid link".into()))?;
    if !matches!(parsed.scheme(), "http" | "https" | "mailto") {
        return Err(AppError::Invalid("Only web and email links can be opened".into()));
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}
