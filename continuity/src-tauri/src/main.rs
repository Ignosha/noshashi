#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Intentionally no commands, shell access, plugins, signing, or custody.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("unable to run NOSHASHI Continuity");
}
