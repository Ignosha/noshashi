//! NOSHREPAIR's native shell.
//!
//! It does as little as possible. The window can only show NOSHREPAIR's own
//! bundled pages: any navigation elsewhere is refused, so a link in a
//! customer's message cannot turn the staff console into someone else's
//! page. The one native command opens a new NOSHASHI GitHub issue in the
//! browser and refuses every other address.

use std::process::Command;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

const ISSUE_PREFIX: &str = "https://github.com/Ignosha/noshashi/issues/new?";

/// The pages the window may show: the bundled app, and the dev server in debug builds.
fn allowed_navigation(url: &Url) -> bool {
    match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => true,
        ("http" | "https", Some("tauri.localhost")) => true,
        ("http", Some("localhost")) if cfg!(debug_assertions) => url.port() == Some(1430),
        _ => false,
    }
}

/// Exactly one shape of address: a new issue on the NOSHASHI repository.
fn is_issue_url(raw: &str) -> bool {
    if !raw.starts_with(ISSUE_PREFIX) || raw.len() > 8_000 {
        return false;
    }
    match Url::parse(raw) {
        Ok(url) => {
            url.scheme() == "https"
                && url.host_str() == Some("github.com")
                && url.path() == "/Ignosha/noshashi/issues/new"
                && url.username().is_empty()
                && url.password().is_none()
        }
        Err(_) => false,
    }
}

#[tauri::command]
fn open_issue(url: String) -> Result<(), String> {
    if !is_issue_url(&url) {
        return Err("NOSHREPAIR only opens new GitHub issues for NOSHASHI.".into());
    }
    // Re-serialised by the URL parser, and launched the same way as the
    // NOSHASHI app's open_external: never through a shell (on Windows,
    // `cmd /C start` would re-parse `&` in the query as a command separator).
    let url = Url::parse(&url).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let result = Command::new("/usr/bin/open").arg(url.as_str()).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url.as_str()])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(url.as_str()).spawn();

    result.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_issue])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("NOSHREPAIR · NOSHASHI Support")
                .inner_size(1280.0, 840.0)
                .min_inner_size(720.0, 560.0)
                .center()
                .on_navigation(|url| allowed_navigation(url))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("NOSHREPAIR failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_new_noshashi_issues() {
        assert!(is_issue_url("https://github.com/Ignosha/noshashi/issues/new?title=x"));
        assert!(!is_issue_url("https://github.com/Ignosha/noshashi/issues/1"));
        assert!(!is_issue_url("https://user:pw@github.com/Ignosha/noshashi/issues/new?x"));
        assert!(!is_issue_url("https://github.com/Ignosha/noshashi/issues/new/../../../evil?x"));
        assert!(!is_issue_url("https://github.com.evil.example/Ignosha/noshashi/issues/new?x"));
        assert!(!is_issue_url("file:///etc/passwd"));
        assert!(!is_issue_url("https://evil.example/?https://github.com/Ignosha/noshashi/issues/new?"));
    }

    #[test]
    fn navigates_only_to_its_own_pages() {
        assert!(allowed_navigation(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(allowed_navigation(&Url::parse("http://tauri.localhost/").unwrap()));
        assert!(!allowed_navigation(&Url::parse("https://example.com/").unwrap()));
        assert!(!allowed_navigation(&Url::parse("https://xiurbiwuwcfowqnpmwki.supabase.co/").unwrap()));
    }
}
