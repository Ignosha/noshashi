// NOSHASHI desktop entry point. The app itself lives in lib.rs, where iOS
// enters it too.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    noshashi_lib::run()
}
