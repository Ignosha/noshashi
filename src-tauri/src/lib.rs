// NOSHASHI — autonomous compliance layer mission control.
//
// On the desktop the app is a menu bar resident first and a window
// second: the tray icon owns a compact HUD panel, and the full console is
// a separate window that hides rather than quits. Closing every window
// leaves the flower in the menu bar, which is where the product lives.
//
// On iOS there is no menu bar, no second window, no global accelerator and
// no self-update, so everything about the tray, the HUD, shortcuts, launch
// at login and the updater is compiled for the desktop only (`desktop` and
// `mobile` are set by tauri-build). The commands the web view calls keep
// the same names on iOS and answer plainly that the feature is not there,
// so no screen needs to know which platform it is on to stay up.

use std::fs;
use std::io::Read;

mod model_proxy;

use sha2::{Digest, Sha256};

use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use std::process::Command;
#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
#[cfg(desktop)]
use tauri_plugin_positioner::{Position, WindowExt};

#[cfg(desktop)]
const MAIN_WINDOW: &str = "main";
#[cfg(desktop)]
const TRAY_WINDOW: &str = "tray";

/// Keychain coordinates for the compliance API secret. The value is
/// written and cleared from the UI but never read back into the webview.
const KEYRING_SERVICE: &str = "com.noshashi.compliance";
const KEYRING_ACCOUNT: &str = "compliance-api";

#[cfg(desktop)]
/// Whether the global accelerator is currently armed. Held in state so
/// the UI toggle and the tray menu stay in agreement.
struct ShortcutState_(Mutex<bool>);

#[cfg(desktop)]
fn hud_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyX)
}

#[cfg(desktop)]
/// Show the HUD anchored under the tray icon, or hide it if it is up.
fn toggle_hud(app: &AppHandle) {
    let Some(window) = app.get_webview_window(TRAY_WINDOW) else {
        return;
    };

    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }

    // `move_window` reads the tray rectangle recorded by the positioner
    // plugin's tray event hook, so this lands under the flower.
    let _ = window.move_window(Position::TrayCenter);
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(desktop)]
fn show_console(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
#[tauri::command]
fn toggle_tray_window(app: AppHandle) {
    toggle_hud(&app);
}

#[cfg(desktop)]
#[tauri::command]
fn open_console_window(app: AppHandle) {
    show_console(&app);
    // Opening the console is an explicit "go bigger" gesture; the small
    // panel getting out of the way is what the user means by it.
    if let Some(window) = app.get_webview_window(TRAY_WINDOW) {
        let _ = window.hide();
    }
}

#[cfg(desktop)]
#[tauri::command]
fn set_global_shortcut_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let shortcut = hud_shortcut();
    let manager = app.global_shortcut();

    if enabled {
        if !manager.is_registered(shortcut) {
            manager.register(shortcut).map_err(|e| e.to_string())?;
        }
    } else if manager.is_registered(shortcut) {
        manager.unregister(shortcut).map_err(|e| e.to_string())?;
    }

    if let Some(state) = app.try_state::<ShortcutState_>() {
        *state.0.lock().unwrap() = enabled;
    }
    Ok(())
}

#[tauri::command]
fn store_api_secret(secret: String) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| e.to_string())?
        .set_password(&secret)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn has_api_secret() -> bool {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .and_then(|entry| entry.get_password())
        .is_ok()
}

#[tauri::command]
fn clear_api_secret() -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Clearing something that was never stored is a success, not a fault.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Write a generated document (the audit trail) into ~/Downloads and
/// return the path, because a webview `<a download>` is unreliable
/// inside a Tauri window.
#[tauri::command]
fn export_text_file(app: AppHandle, filename: String, contents: String) -> Result<String, String> {
    // Never let the webview escape the target directory.
    //
    // Taking the last path segment is not enough on Windows: `join` REPLACES
    // the base path when the argument carries a drive prefix, so a filename
    // of `C:audit.csv` survives the split intact and writes to whatever the
    // process's current directory on C: happens to be. Reject anything
    // carrying a separator, a drive letter, or a control character rather
    // than trying to salvage a tail from it.
    let name = filename.trim();
    let looks_like_a_path = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', ':'])
        || name.chars().any(char::is_control);
    if looks_like_a_path {
        return Err("Invalid file name".to_string());
    }
    let safe_name = name;

    let directory = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;

    // 64 MB is far beyond any real audit trail and well short of a
    // denial-of-service by way of the Downloads folder.
    const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;
    if contents.len() > MAX_EXPORT_BYTES {
        return Err("Export is too large to write".into());
    }

    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let destination = directory.join(safe_name);
    fs::write(&destination, contents).map_err(|e| e.to_string())?;

    Ok(destination.to_string_lossy().to_string())
}

/// Write a generated binary document into ~/Downloads and return the path.
#[tauri::command]
fn export_binary_file(
    app: AppHandle,
    filename: String,
    contents: Vec<u8>,
) -> Result<String, String> {
    let name = filename.trim();
    let looks_like_a_path = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', ':'])
        || name.chars().any(char::is_control);
    if looks_like_a_path {
        return Err("Invalid file name".to_string());
    }
    let safe_name = name;

    let directory = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let destination = directory.join(safe_name);
    fs::write(&destination, contents).map_err(|e| e.to_string())?;

    Ok(destination.to_string_lossy().to_string())
}

/// Binary integrity: the SHA-256 of the executable that is running.
///
/// A solo-published, unsigned application asks a lot of trust. This asks
/// for less of it: the operator can hash the binary themselves and
/// compare, and any tampering between download and execution changes
/// the digest. It reads the running executable rather than a path the
/// front end supplies, so it cannot be pointed at a decoy file.
#[derive(serde::Serialize)]
struct IntegrityReport {
    digest: String,
    path: String,
    bytes: u64,
    version: String,
}

#[tauri::command]
fn verify_integrity(app: AppHandle) -> Result<IntegrityReport, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let mut file = fs::File::open(&exe).map_err(|error| error.to_string())?;

    // Streamed in chunks: the binary is tens of megabytes and there is no
    // reason to hold all of it in memory to hash it.
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65_536];
    let mut total: u64 = 0;
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        total += read as u64;
    }

    Ok(IntegrityReport {
        digest: format!("{:X}", hasher.finalize()),
        path: exe.to_string_lossy().to_string(),
        bytes: total,
        version: app.package_info().version.to_string(),
    })
}

/// Model-provider API keys, one keyring entry per provider.
///
/// Like the compliance secret, these are written and cleared from the UI
/// but never read back into the web view: model requests are made in
/// model_proxy.rs, which takes the key from here and puts it on the TLS
/// connection itself. The value never lands in a preferences file, a
/// log, browser storage or JavaScript, and each provider has its own
/// entry so revoking one does not disturb another.
fn provider_entry(provider: &str) -> Result<keyring::Entry, String> {
    // Keep the account name a strict slug so a caller cannot smuggle
    // separators into the keyring namespace.
    if provider.is_empty()
        || provider.len() > 40
        || !provider.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid provider id".into());
    }
    keyring::Entry::new(KEYRING_SERVICE, &format!("provider:{provider}"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn store_provider_key(provider: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("Key is empty".into());
    }
    provider_entry(&provider)?
        .set_password(key.trim())
        .map_err(|error| error.to_string())
}

/// Read by model_proxy.rs only; deliberately not a command.
pub(crate) fn provider_key(provider: &str) -> Result<Option<String>, String> {
    match provider_entry(provider)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn has_provider_key(provider: String) -> Result<bool, String> {
    Ok(provider_key(&provider)?.is_some())
}

#[tauri::command]
fn clear_provider_key(provider: String) -> Result<(), String> {
    match provider_entry(&provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Write the live ticker text beside the menu bar icon.
#[cfg(desktop)]
///
/// macOS renders a tray title in the menu bar font next to the icon, so
/// the gate verdict and ledger height are readable without opening
/// anything. The string is clamped because the menu bar is shared real
/// estate — an app that eats it is an app that gets removed.
#[tauri::command]
fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    let trimmed: String = title.chars().filter(|c| !c.is_control()).take(24).collect();
    let tray = app
        .tray_by_id("noshashi-tray")
        .ok_or_else(|| "Tray icon unavailable".to_string())?;

    #[cfg(target_os = "macos")]
    {
        tray.set_title(if trimmed.is_empty() { None } else { Some(&trimmed) })
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Other platforms have no title slot; the tooltip is the closest thing.
        tray.set_tooltip(if trimmed.is_empty() { None } else { Some(&trimmed) })
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Hand a URL to the operating system's default browser.
///
/// Checkout and the billing portal must render on Stripe's own origin,
/// never inside our web view. The scheme is checked here rather than
/// trusted from the caller, so a compromised front end cannot use this
/// to launch a local binary or open a `file://` path.
#[cfg(desktop)]
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|_| "Not a valid URL".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("Refusing to open a non-web URL".into());
    }

    #[cfg(target_os = "macos")]
    let result = Command::new("/usr/bin/open").arg(parsed.as_str()).spawn();

    // NOT `cmd /C start`. cmd.exe re-parses its command line with its own
    // rules, which Rust's argument quoting does not cover: `&`, `|` and `^`
    // are separators to cmd and are passed through unquoted, so a URL of
    // `https://example.com/?a=b&calc.exe` ran calc.exe. That is precisely
    // the escape this command exists to prevent, reachable from any front
    // end able to call open_external. rundll32 is an ordinary executable —
    // no shell, standard argument quoting, and no console window flash.
    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", parsed.as_str()])
        .spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(parsed.as_str()).spawn();

    result.map(|_| ()).map_err(|error| error.to_string())
}

#[cfg(desktop)]
fn build_app_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let about = PredefinedMenuItem::about(app, Some("About NOSHASHI"), None)?;
    let hide = PredefinedMenuItem::hide(app, None)?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit NOSHASHI"))?;
    let app_menu = Submenu::with_items(
        app,
        "NOSHASHI",
        true,
        &[&about, &PredefinedMenuItem::separator(app)?, &hide, &quit],
    )?;

    let export = MenuItem::with_id(app, "export", "Export Audit Trail…", true, Some("CmdOrCtrl+S"))?;
    let file_menu = Submenu::with_items(app, "File", true, &[&export])?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let hud = MenuItem::with_id(app, "toggle-hud", "Toggle Menu Bar HUD", true, Some("CmdOrCtrl+Shift+X"))?;
    let console = MenuItem::with_id(app, "open-console", "Mission Control", true, Some("CmdOrCtrl+0"))?;
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &console,
            &hud,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &window_menu])
}

/// Whether this build carries an updater public key.
///
/// The updater plugin refuses to initialise without one, and that failure
/// takes the whole application down at startup — so a checkout that has not
/// had `npm run tauri signer generate` run against it would not launch at
/// all. Reading the committed config at compile time lets the plugin be
/// registered only when it can actually work; `updater_configured` is
/// exposed to the front end so the Settings panel can say which it is
/// rather than showing a button that fails.
#[cfg(desktop)]
const TAURI_CONF: &str = include_str!("../tauri.conf.json");

#[cfg(desktop)]
fn updater_public_key() -> String {
    serde_json::from_str::<serde_json::Value>(TAURI_CONF)
        .ok()
        .and_then(|conf| {
            conf.get("plugins")?
                .get("updater")?
                .get("pubkey")?
                .as_str()
                .map(str::to_owned)
        })
        .unwrap_or_default()
}

#[cfg(desktop)]
#[tauri::command]
fn updater_configured() -> bool {
    !updater_public_key().trim().is_empty()
}

/// The iOS answers for the desktop-only commands. Same names and argument
/// shapes, so one invoke handler serves both and a screen that calls one
/// gets a plain refusal rather than "command not found".
#[cfg(mobile)]
mod mobile {
    use tauri::AppHandle;

    const NOT_ON_THIS_DEVICE: &str = "Not available on this device";

    #[tauri::command]
    pub fn toggle_tray_window(_app: AppHandle) {}

    /// There is one window on iOS and it is always the console.
    #[tauri::command]
    pub fn open_console_window(_app: AppHandle) {}

    #[tauri::command]
    pub fn set_global_shortcut_enabled(_app: AppHandle, _enabled: bool) -> Result<(), String> {
        Err(NOT_ON_THIS_DEVICE.into())
    }

    /// Called on every ledger tick to update the menu bar text; iOS has no
    /// menu bar, so it succeeds and does nothing rather than failing on
    /// every tick.
    #[tauri::command]
    pub fn set_tray_title(_app: AppHandle, _title: String) -> Result<(), String> {
        Ok(())
    }

    /// The desktop build hands links to the system browser with a process
    /// launch, which iOS does not allow. Refused until the opener plugin
    /// is added for mobile, so checkout cannot silently open inside the app.
    #[tauri::command]
    pub fn open_external(_url: String) -> Result<(), String> {
        Err("Opening links in the browser is not available in this iOS build yet".into())
    }

    /// iOS apps are updated by the App Store or TestFlight, never in place.
    #[tauri::command]
    pub fn updater_configured() -> bool {
        false
    }
}
#[cfg(mobile)]
use mobile::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            toggle_tray_window,
            open_console_window,
            set_global_shortcut_enabled,
            store_api_secret,
            has_api_secret,
            clear_api_secret,
            export_text_file,
            export_binary_file,
            open_external,
            set_tray_title,
            verify_integrity,
            store_provider_key,
            has_provider_key,
            clear_provider_key,
            model_proxy::model_request,
            model_proxy::model_cancel,
            updater_configured
        ]);

    #[cfg(desktop)]
    let builder = desktop(builder);

    builder
        .run(tauri::generate_context!())
        .expect("error while running NOSHASHI");
}

/// Everything the menu bar app adds on top of the shared core: the plugins
/// that only exist on the desktop, the native menus, the tray and its HUD,
/// the global accelerator, hide-on-close and the signed updater.
#[cfg(desktop)]
fn desktop(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    let mut builder = builder
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Fire on press only; the release event would toggle back.
                    if event.state() == ShortcutState::Pressed && shortcut == &hud_shortcut() {
                        toggle_hud(app);
                    }
                })
                .build(),
        )
        .manage(ShortcutState_(Mutex::new(false)))
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = build_app_menu(&handle)?;
            app.set_menu(menu)?;
            app.on_menu_event(move |app, event| match event.id().as_ref() {
                "toggle-hud" => toggle_hud(app),
                "open-console" => show_console(app),
                "export" => {
                    // The console owns the export UI; surface it and let the
                    // webview run the same action the toolbar button does.
                    show_console(app);
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                        let _ = window.eval("window.dispatchEvent(new CustomEvent('noshashi:export'))");
                    }
                }
                _ => {}
            });

            // Arm the global accelerator by default — a menu bar app that
            // needs the mouse to appear is not really a menu bar app.
            let shortcut = hud_shortcut();
            if app.global_shortcut().register(shortcut).is_ok() {
                *app.state::<ShortcutState_>().0.lock().unwrap() = true;
            }

            if let Some(tray) = app.tray_by_id("noshashi-tray") {
                let open_item =
                    MenuItem::with_id(&handle, "tray-console", "Open Mission Control", true, None::<&str>)?;
                let hud_item =
                    MenuItem::with_id(&handle, "tray-hud", "Toggle HUD", true, None::<&str>)?;
                let quit_item = PredefinedMenuItem::quit(&handle, Some("Quit NOSHASHI"))?;
                let tray_menu = Menu::with_items(
                    &handle,
                    &[
                        &open_item,
                        &hud_item,
                        &PredefinedMenuItem::separator(&handle)?,
                        &quit_item,
                    ],
                )?;
                tray.set_menu(Some(tray_menu))?;

                tray.on_menu_event(|app, event| match event.id().as_ref() {
                    "tray-console" => show_console(app),
                    "tray-hud" => toggle_hud(app),
                    _ => {}
                });

                tray.on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    // Records the tray rectangle so Position::TrayCenter works.
                    tauri_plugin_positioner::on_tray_event(app, &event);

                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_hud(app);
                    }
                });
            }

            // The window is configured `visible: false` so it never appears
            // half-painted while the webview loads, and it is revealed here
            // once setup has finished. Nothing in the front end shows it, so
            // this call is what actually puts the console on screen —
            // removing it leaves the app running with no window at all.
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                // Never terminate on a window close: the tray icon is the app.
                if window.label() == MAIN_WINDOW || window.label() == TRAY_WINDOW {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            WindowEvent::Focused(false) => {
                // Standard menu bar behaviour — the panel dismisses itself.
                if window.label() == TRAY_WINDOW {
                    let _ = window.hide();
                }
            }
            _ => {}
        });

    // Registered last and only when signed updates can actually be verified.
    // With no public key the plugin's own initialisation fails, and that is a
    // startup failure for the whole application rather than a missing button.
    if updater_configured() {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
}
