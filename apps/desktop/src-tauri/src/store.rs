//! Local persistence. Notes live in `notes.json`, preferences in
//! `settings.json`, both inside a single data folder:
//!   * normal mode:   Documents\Peekin
//!   * portable mode: <exe dir>\PeekinData  (enabled by a `portable` marker
//!     file next to the executable)
//!
//! Writes are atomic (temp file + rename) and coalesced by `state.rs`.

use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::sanitize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const APP_DIR: &str = "Peekin";
pub const PORTABLE_DIR: &str = "PeekinData";
pub const PORTABLE_MARKER: &str = "portable";
const NOTES_FILE: &str = "notes.json";
const SETTINGS_FILE: &str = "settings.json";
const FILE_VERSION: u32 = 1;

#[derive(Debug, Clone)]
pub struct DataPaths {
    pub dir: PathBuf,
    pub portable: bool,
}

impl DataPaths {
    pub fn resolve(documents: Option<PathBuf>) -> AppResult<Self> {
        if let Some(exe_dir) = exe_dir() {
            if exe_dir.join(PORTABLE_MARKER).is_file() {
                return Ok(Self { dir: exe_dir.join(PORTABLE_DIR), portable: true });
            }
        }
        let base = documents
            .or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("Documents")))
            .ok_or_else(|| AppError::Other("Could not find the Documents folder".into()))?;
        Ok(Self { dir: base.join(APP_DIR), portable: false })
    }
    pub fn notes(&self) -> PathBuf {
        self.dir.join(NOTES_FILE)
    }
    pub fn settings(&self) -> PathBuf {
        self.dir.join(SETTINGS_FILE)
    }
}

pub fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(Path::to_path_buf)
}

/// Write `bytes` to `path` atomically: write a sibling temp file, fsync, then
/// rename over the original so a crash never leaves a half-written file.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path.parent().ok_or_else(|| AppError::Other("bad path".into()))?;
    fs::create_dir_all(dir)?;
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Normalise an untrusted note (from disk or import): sanitise body, clamp
/// lengths and ranges, rebuild the text projection.
pub fn normalize(mut n: Note) -> Note {
    if uuid::Uuid::parse_str(&n.id).is_err() {
        n.id = uuid::Uuid::new_v4().to_string();
    }
    n.title = clamp_chars(n.title.replace(['\n', '\r'], " ").trim(), MAX_TITLE);
    n.body = sanitize::clean_html(&truncate_bytes(&n.body, MAX_BODY));
    n.text = sanitize::html_to_text(&n.body);
    n.color %= COLOR_COUNT;
    let now = now_ms();
    if n.created == 0 || n.created > now + 86_400_000 {
        n.created = now;
    }
    if n.updated < n.created {
        n.updated = n.created;
    }
    // Apps: migrate the old single field, keep valid unique names, max 5.
    if let Some(old) = n.app.take() {
        if n.apps.is_empty() {
            n.apps.push(old);
        }
    }
    let mut apps: Vec<String> = Vec::new();
    for a in n.apps.drain(..) {
        let a = a.to_ascii_lowercase();
        if valid_app(&a) && !apps.contains(&a) && apps.len() < MAX_APPS {
            apps.push(a);
        }
    }
    n.apps = apps;
    // Keep past-due reminders (they fire at startup); drop absurd ones.
    if n.remind_at.is_some_and(|t| t > now + 5 * 365 * 86_400_000) {
        n.remind_at = None;
    }
    if n.remind_at.is_none() {
        n.repeat = None;
    }
    if let Some(b) = n.bounds {
        if b.w < 200 || b.h < 160 || b.w > 4000 || b.h > 4000 {
            n.bounds = None;
        }
    }
    n
}

pub fn clamp_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn truncate_bytes(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

pub fn load_notes(paths: &DataPaths) -> Vec<Note> {
    let path = paths.notes();
    let raw = match fs::read(&path) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    match parse_notes(&raw) {
        Ok(notes) => {
            // keep one rolling backup of the last good file
            let _ = fs::copy(&path, path.with_extension("json.bak"));
            notes
        }
        Err(_) => {
            // Never destroy unreadable data: move it aside and start fresh.
            let aside = path.with_extension(format!("corrupt-{}.json", now_ms()));
            let _ = fs::rename(&path, aside);
            Vec::new()
        }
    }
}

/// Parse notes from either our versioned file or a bare array.
pub fn parse_notes(raw: &[u8]) -> AppResult<Vec<Note>> {
    let value: serde_json::Value = serde_json::from_slice(raw)?;
    let arr = match value {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Object(mut o) => match o.remove("notes") {
            Some(serde_json::Value::Array(a)) => a,
            _ => return Err(AppError::Invalid("No notes found in file".into())),
        },
        _ => return Err(AppError::Invalid("No notes found in file".into())),
    };
    let mut out = Vec::with_capacity(arr.len().min(MAX_NOTES));
    for v in arr.into_iter().take(MAX_NOTES) {
        if let Ok(n) = serde_json::from_value::<Note>(v) {
            out.push(normalize(n));
        }
    }
    Ok(out)
}

pub fn serialize_notes(notes: &[Note]) -> AppResult<Vec<u8>> {
    #[derive(serde::Serialize)]
    struct Out<'a> {
        version: u32,
        app: &'static str,
        notes: &'a [Note],
    }
    Ok(serde_json::to_vec_pretty(&Out { version: FILE_VERSION, app: "Peekin", notes })?)
}

pub fn load_settings(paths: &DataPaths) -> Settings {
    fs::read(paths.settings())
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_default()
}

pub fn save_settings(paths: &DataPaths, s: &Settings) -> AppResult<()> {
    atomic_write(&paths.settings(), &serde_json::to_vec_pretty(s)?)
}

/// Markdown export: one heading per note, body as plain text.
pub fn to_markdown(notes: &[Note]) -> String {
    let mut out = String::from("# Peekin notes\n\n");
    for n in notes {
        let title = if n.title.is_empty() { "Untitled" } else { &n.title };
        out.push_str(&format!("## {title}\n\n"));
        if n.status == Status::Archived {
            out.push_str("_Archived_\n\n");
        }
        out.push_str(&n.text);
        out.push_str("\n\n---\n\n");
    }
    out
}
