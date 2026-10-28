// NOSHASHI Academy desktop entry point. The app lives in lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    noshashi_academy_lib::run()
}
