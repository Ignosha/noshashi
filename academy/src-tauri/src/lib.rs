//! NOSHASHI Academy's native shell, for the desktop and for iPhone and iPad.
//!
//! It does as little as possible. The window shows only the Academy's own
//! bundled pages; any navigation elsewhere is refused. Two commands: open a
//! noshashi.app page in the browser (and nothing else), and save a
//! certificate of completion (an .html file, nothing else): into Downloads
//! on the desktop, and into the app's Documents folder on iOS, which the
//! Files app shows under On My iPhone › NOSHASHI Academy.

use std::path::PathBuf;
use tauri::{WebviewUrl, WebviewWindowBuilder};
use url::Url;

/// The pages the window may show: the bundled app, and the dev server in debug builds.
fn allowed_navigation(url: &Url) -> bool {
    match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => true,
        ("http" | "https", Some("tauri.localhost")) => true,
        ("http", Some("localhost")) if cfg!(debug_assertions) => url.port() == Some(1440),
        _ => false,
    }
}

/// Only NOSHASHI's own website, over https, with no credentials in the address.
fn is_noshashi_page(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    let host_ok = matches!(url.host_str(), Some("www.noshashi.app") | Some("noshashi.app"));
    (url.scheme() == "https" && host_ok && url.username().is_empty() && url.password().is_none() && url.port().is_none() && raw.len() <= 4_000).then_some(url)
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let url = is_noshashi_page(&url).ok_or("The Academy only opens pages on noshashi.app.")?;
    open_in_browser(&url)
}

/// Launched directly, never through a shell (on Windows, `cmd /C start`
/// would re-parse `&` in the query as a command separator).
#[cfg(desktop)]
fn open_in_browser(url: &Url) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "macos")]
    let result = Command::new("/usr/bin/open").arg(url.as_str()).spawn();
    #[cfg(target_os = "windows")]
    let result = Command::new("rundll32").args(["url.dll,FileProtocolHandler", url.as_str()]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(url.as_str()).spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// An iOS app cannot start another program; the page names the link instead.
#[cfg(mobile)]
fn open_in_browser(url: &Url) -> Result<(), String> {
    Err(format!("Open {url} in Safari."))
}

/// A certificate's file name: letters, digits and dashes, ending .html, nothing that could climb out of Downloads.
fn safe_certificate_name(name: &str) -> Option<String> {
    let stem = name.strip_suffix(".html")?;
    let ok = !stem.is_empty() && stem.len() <= 80 && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    ok.then(|| name.to_string())
}

/// Where certificates are saved: Downloads on the desktop; on iOS the app's
/// own Documents folder (the app's home is its sandbox there).
fn certificates_dir() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?);
    if cfg!(target_os = "ios") {
        let dir = home.join("Documents");
        std::fs::create_dir_all(&dir).ok()?;
        return Some(dir);
    }
    let dir = home.join("Downloads");
    dir.is_dir().then_some(dir)
}

/// Save a certificate. Same command name as NOSHASHI's export so the shared
/// saveTextFile helper works here unchanged; it accepts only certificates.
#[tauri::command]
fn export_text_file(filename: String, contents: String) -> Result<String, String> {
    let name = safe_certificate_name(&filename).ok_or("The Academy saves certificates only.")?;
    if contents.len() > 200_000 || !contents.starts_with("<!doctype html>") {
        return Err("That is not a certificate.".into());
    }
    let dir = certificates_dir().ok_or("No Downloads folder was found.")?;
    let path = dir.join(&name);
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    if cfg!(target_os = "ios") {
        return Ok(format!("the Files app, On My iPhone › NOSHASHI Academy › {name}"));
    }
    Ok(path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_external, export_text_file])
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into())).on_navigation(|url| allowed_navigation(url));
            // Sizing and a title belong to desktop windows; on iOS the app fills the screen.
            #[cfg(desktop)]
            let window = window.title("NOSHASHI Academy").inner_size(1180.0, 820.0).min_inner_size(640.0, 520.0).center();
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("NOSHASHI Academy failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_noshashi_pages() {
        assert!(is_noshashi_page("https://www.noshashi.app/learn/videos/02-xrpl-basics.mp4").is_some());
        assert!(is_noshashi_page("https://noshashi.app/academy/certificate/#abc").is_some());
        assert!(is_noshashi_page("http://www.noshashi.app/").is_none());
        assert!(is_noshashi_page("https://www.noshashi.app.evil.example/").is_none());
        assert!(is_noshashi_page("https://user:pw@www.noshashi.app/").is_none());
        assert!(is_noshashi_page("https://www.noshashi.app:8443/").is_none());
        assert!(is_noshashi_page("file:///etc/passwd").is_none());
    }

    #[test]
    fn saves_only_certificate_files() {
        assert!(safe_certificate_name("noshashi-certificate-1A2B-3C4D-5E6F-7A8B.html").is_some());
        assert!(safe_certificate_name("../../etc/passwd.html").is_none());
        assert!(safe_certificate_name("cert.exe").is_none());
        assert!(safe_certificate_name("a b.html").is_none());
        assert!(safe_certificate_name(".html").is_none());
    }

    #[test]
    fn navigates_only_to_its_own_pages() {
        assert!(allowed_navigation(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(allowed_navigation(&Url::parse("http://tauri.localhost/").unwrap()));
        assert!(!allowed_navigation(&Url::parse("https://www.noshashi.app/").unwrap()));
        assert!(!allowed_navigation(&Url::parse("https://example.com/").unwrap()));
    }
}
