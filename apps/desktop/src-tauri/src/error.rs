use serde::{Serialize, Serializer};

/// Single error type for every command. Serialised as a plain message so the
/// frontend never sees internal paths or debug output.
#[derive(Debug)]
pub enum AppError {
    NotFound,
    Invalid(String),
    Io(std::io::Error),
    Json(serde_json::Error),
    Tauri(tauri::Error),
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::NotFound => write!(f, "Note not found"),
            AppError::Invalid(m) => write!(f, "{m}"),
            AppError::Io(e) => write!(f, "File error: {}", e.kind()),
            AppError::Json(e) => write!(f, "The file is not valid notes data (line {})", e.line()),
            AppError::Tauri(e) => write!(f, "Window error: {e}"),
            AppError::Other(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Json(e)
    }
}
impl From<tauri::Error> for AppError {
    fn from(e: tauri::Error) -> Self {
        AppError::Tauri(e)
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
