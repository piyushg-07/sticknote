//! Peekin — sticky notes that live on the edge of your screen.
//!
//! Module map:
//!   models    – data types (notes, settings)
//!   store     – on-disk persistence (atomic JSON files)
//!   sanitize  – HTML allow-listing for note bodies
//!   state     – in-memory state, coalesced saves, event names
//!   commands  – IPC surface (notes / settings / windows / io)
//!   windows   – deck, note and manager window factories
//!   platform  – Win32 specifics (tool windows, fullscreen watcher)
//!   tray, shortcuts – system integrations

mod commands;
mod error;
mod models;
mod platform;
mod reminders;
mod sanitize;
mod shortcuts;
mod state;
mod store;
mod tray;
mod windows;

use models::{now_ms, Note};
use state::AppState;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

const AUTOSTART_FLAG: &str = "--autostart";

pub fn quit(app: &AppHandle) {
    app.state::<AppState>().flush();
    app.exit(0);
}

fn welcome_notes() -> Vec<Note> {
    let now = now_ms();
    let mk = |i: i64, title: &str, body: &str, color: u8| {
        let mut n = Note::new(color, i);
        n.title = title.into();
        n.body = body.into();
        n.created = now - (i as u64) * 60_000;
        n.updated = n.created;
        store::normalize(n)
    };
    vec![
        mk(0, "Welcome", "<div>Your notes live on the edge of the screen. Hover a tab to peek, click it to edit.</div><div><br></div><div>Press <b>Ctrl+Alt+N</b> anywhere for a new note.</div>", 3),
        mk(1, "Try lists", "<div>Type <b>-</b>, <b>1.</b> or <b>[ ]</b> and a space to start a list.</div><ul class=\"checklist\"><li data-checked=\"true\">Hover a tab</li><li data-checked=\"false\">Drag a tab to reorder</li><li data-checked=\"false\">Press Ctrl+. to change colour</li></ul>", 1),
        mk(2, "Shortcuts", "<ul><li>Ctrl+Alt+N — new note</li><li>Ctrl+Alt+A — all notes</li><li>Ctrl+Alt+L — archive</li><li>Esc — close a note</li></ul>", 0),
    ]
}

pub fn run() {
    tauri::Builder::default()
        // must be first so a second launch is caught before anything else starts
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = windows::manager::open(app, Some("all"));
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_FLAG])))
        .plugin(shortcuts::plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let paths = store::DataPaths::resolve(app.path().document_dir().ok())?;
            let first_run = !paths.notes().exists();
            let state = AppState::new(paths);
            if first_run {
                state.inner.lock().notes = welcome_notes();
                state.flush();
            }
            app.manage(state);

            tray::create(&handle, &commands::settings::view(&handle))?;
            shortcuts::register(&handle);
            windows::deck::create(&handle)?;
            windows::note::prewarm(&handle); // a ready note window = instant opening
            windows::capture::create(&handle)?; // hidden until Ctrl+Alt+N / "+"
            reminders::start(&handle);
            platform::start_fullscreen_watcher(handle.clone());

            let autostarted = std::env::args().any(|a| a == AUTOSTART_FLAG);
            if !autostarted {
                windows::manager::open(&handle, Some("all"))?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                if window.label().starts_with(windows::note::PREFIX) {
                    windows::note::on_destroyed(window.app_handle(), window.label());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::notes::list_notes,
            commands::notes::get_note,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::set_color,
            commands::notes::cycle_color,
            commands::notes::set_font,
            commands::notes::set_reminder,
            commands::notes::clear_alert,
            commands::notes::set_note_apps,
            commands::notes::quick_note,
            commands::notes::set_status,
            commands::notes::set_on_deck,
            commands::notes::delete_notes,
            commands::notes::undo_delete,
            commands::notes::reorder_notes,
            commands::notes::save_note_bounds,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::get_app_info,
            commands::window::open_note_window,
            commands::window::open_manager,
            commands::window::take_initial_view,
            commands::window::deck_resize,
            commands::window::close_self,
            commands::window::note_ready,
            commands::window::note_id,
            commands::window::open_capture,
            commands::window::context_apps,
            commands::window::app_icons,
            commands::window::quit_app,
            commands::io::export_notes,
            commands::io::open_link,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Peekin")
        .run(|app, event| match event {
            // Closing the last visible window must not quit: the app lives in
            // the tray and on the deck. Only an explicit exit code quits.
            RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
            RunEvent::Exit => app.state::<AppState>().flush(),
            _ => {}
        });
}
