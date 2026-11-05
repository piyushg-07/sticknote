//! System-wide hotkeys. If another app already owns a combination we skip it
//! silently; the tray menu reaches the same commands.

use crate::windows::manager;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn bindings() -> [(Shortcut, &'static str); 3] {
    let m = Some(Modifiers::CONTROL | Modifiers::ALT);
    [
        (Shortcut::new(m, Code::KeyN), "new"),
        (Shortcut::new(m, Code::KeyA), "all"),
        (Shortcut::new(m, Code::KeyL), "archive"),
    ]
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let Some((_, action)) = bindings().into_iter().find(|(s, _)| s == shortcut) else {
                return;
            };
            match action {
                "new" => crate::tray::new_note_window(app),
                view => {
                    let _ = manager::open(app, Some(view));
                }
            }
        })
        .build()
}

pub fn register(app: &AppHandle) {
    let gs = app.global_shortcut();
    for (s, name) in bindings() {
        if let Err(e) = gs.register(s) {
            log::info!("shortcut {name} unavailable: {e}");
        }
    }
}
