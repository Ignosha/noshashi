// NOSHREPAIR desktop entry point. The app lives in lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    noshrepair_lib::run()
}
