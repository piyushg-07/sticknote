//! Window factories. Every window is created on demand and destroyed on
//! close (never merely hidden), so idle memory stays minimal.

pub mod capture;
pub mod deck;
pub mod manager;
pub mod note;

use tauri::AppHandle;

/// Work area (screen minus taskbar) of the primary monitor, in physical px,
/// plus its scale factor.
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub scale: f64,
}

pub fn primary_work_area(app: &AppHandle) -> WorkArea {
    let mon = app.primary_monitor().ok().flatten().or_else(|| {
        app.available_monitors().ok().and_then(|m| m.into_iter().next())
    });
    match mon {
        Some(m) => {
            let wa = m.work_area();
            WorkArea {
                x: wa.position.x,
                y: wa.position.y,
                w: wa.size.width,
                h: wa.size.height,
                scale: m.scale_factor(),
            }
        }
        None => WorkArea { x: 0, y: 0, w: 1920, h: 1040, scale: 1.0 },
    }
}
