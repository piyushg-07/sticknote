// Every app command is gated behind an explicit permission. Windows only get
// the commands their capability file grants (see capabilities/*.json), so a
// compromised deck webview can't, say, import files or change settings.
const COMMANDS: &[&str] = &[
    // notes
    "list_notes",
    "get_note",
    "create_note",
    "update_note",
    "set_color",
    "cycle_color",
    "set_font",
    "set_reminder",
    "clear_alert",
    "set_note_apps",
    "quick_note",
    "set_status",
    "set_on_deck",
    "delete_notes",
    "undo_delete",
    "reorder_notes",
    "save_note_bounds",
    // settings
    "get_settings",
    "update_settings",
    "get_app_info",
    // windows
    "open_note_window",
    "open_manager",
    "take_initial_view",
    "deck_resize",
    "close_self",
    "note_ready",
    "note_id",
    "open_capture",
    "context_apps",
    "app_icons",
    "quit_app",
    // io
    "export_notes",
    "open_link",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
