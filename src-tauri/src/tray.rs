//! System-tray icon and menu.

use crate::commands::settings;
use crate::models::{Edge, SettingsPatch, SettingsView};
use crate::windows::manager;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

pub struct TrayItems {
    edge: MenuItem<Wry>,
    fullscreen: CheckMenuItem<Wry>,
    autostart: CheckMenuItem<Wry>,
    deck: CheckMenuItem<Wry>,
}

fn edge_label(edge: Edge) -> &'static str {
    match edge {
        Edge::Right => "Move deck to the left edge",
        Edge::Left => "Move deck to the right edge",
    }
}

pub fn create(app: &AppHandle, v: &SettingsView) -> tauri::Result<()> {
    let new = MenuItem::with_id(app, "new", "New note", true, Some("Ctrl+Alt+N"))?;
    let all = MenuItem::with_id(app, "all", "All notes", true, Some("Ctrl+Alt+A"))?;
    let archive = MenuItem::with_id(app, "archive", "Archive", true, Some("Ctrl+Alt+L"))?;
    let edge = MenuItem::with_id(app, "edge", edge_label(v.settings.edge), true, None::<&str>)?;
    let deck = CheckMenuItem::with_id(app, "deck", "Show the deck", true, v.settings.show_deck, None::<&str>)?;
    let fullscreen = CheckMenuItem::with_id(
        app,
        "fullscreen",
        "Hide over fullscreen apps",
        true,
        v.settings.hide_fullscreen,
        None::<&str>,
    )?;
    let autostart = CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, v.start_with_windows, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Peekin", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);

    let menu = Menu::with_items(
        app,
        &[
            &new, &all, &archive, &sep()?, &edge, &deck, &fullscreen, &autostart, &sep()?, &settings_item, &sep()?, &quit,
        ],
    )?;

    app.manage(TrayItems { edge, fullscreen, autostart, deck });

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .tooltip("Peekin")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| on_menu(app, e.id().as_ref()))
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                let _ = manager::open(tray.app_handle(), Some("all"));
            }
        })
        .build(app)?;
    Ok(())
}

fn on_menu(app: &AppHandle, id: &str) {
    let current = settings::view(app);
    let patch = match id {
        "new" => {
            new_note_window(app);
            return;
        }
        "all" | "archive" | "settings" => {
            let _ = manager::open(app, Some(id));
            return;
        }
        "quit" => {
            crate::quit(app);
            return;
        }
        "edge" => SettingsPatch {
            edge: Some(match current.settings.edge {
                Edge::Right => Edge::Left,
                Edge::Left => Edge::Right,
            }),
            ..Default::default()
        },
        "deck" => SettingsPatch { show_deck: Some(!current.settings.show_deck), ..Default::default() },
        "fullscreen" => SettingsPatch { hide_fullscreen: Some(!current.settings.hide_fullscreen), ..Default::default() },
        "autostart" => SettingsPatch { start_with_windows: Some(!current.start_with_windows), ..Default::default() },
        _ => return,
    };
    if let Err(e) = settings::apply(app, patch) {
        log::warn!("tray setting failed: {e}");
        sync(app, &settings::view(app));
    }
}

/// "New note" from the tray / global shortcut: the quick-capture card.
pub fn new_note_window(app: &AppHandle) {
    crate::windows::capture::show(app);
}

/// Keep tray labels/checks in sync with settings changed elsewhere.
pub fn sync(app: &AppHandle, v: &SettingsView) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.edge.set_text(edge_label(v.settings.edge));
        let _ = items.fullscreen.set_checked(v.settings.hide_fullscreen);
        let _ = items.autostart.set_checked(v.start_with_windows);
        let _ = items.deck.set_checked(v.settings.show_deck);
    }
}
