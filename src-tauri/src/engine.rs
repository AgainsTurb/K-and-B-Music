// src-tauri/src/engine.rs
use tauri::{AppHandle, Manager};
use std::sync::Mutex;
use std::path::{Path, PathBuf};
use std::fs::File;
use std::io::Write;
use headless_chrome::{Browser, LaunchOptionsBuilder};
use futures_util::StreamExt;
use headless_chrome::protocol::cdp::Network::Cookie;

pub struct EngineState {
    pub is_downloading: Mutex<bool>,
    pub download_progress: Mutex<u8>,
    pub download_status: Mutex<String>, 
    pub download_error: Mutex<String>,
    pub is_browser_busy: Mutex<bool>,
    pub has_checked_background: Mutex<bool>,
    pub cached_cookies: Mutex<Option<Vec<Cookie>>>,
}

#[cfg(target_os = "windows")]
const DOWNLOAD_URL: &str = "https://github.com/CloakHQ/CloakBrowser/releases/download/chromium-v146.0.7680.177.4/cloakbrowser-windows-x64.zip";
#[cfg(target_os = "macos")]
const DOWNLOAD_URL: &str = "https://github.com/CloakHQ/CloakBrowser/releases/download/chromium-v146.0.7680.177.4/cloakbrowser-linux-arm64.tar.gz"; 
#[cfg(target_os = "linux")]
const DOWNLOAD_URL: &str = "https://github.com/CloakHQ/CloakBrowser/releases/download/chromium-v146.0.7680.177.4/cloakbrowser-linux-x64.tar.gz";

fn find_executable(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() { return None; }
    
    let target_names = vec!["chrome.exe", "chromium.exe", "cloakbrowser.exe", "chrome", "chromium", "cloakbrowser"];
    
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(found) = find_executable(&path) {
                    return Some(found);
                }
            } else if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if target_names.contains(&file_name.to_lowercase().as_str()) {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn launch_and_get_cookies(profile_dir: &PathBuf, exe_path: &PathBuf, is_visible: bool) -> Result<Vec<Cookie>, String> {
    let args = vec![std::ffi::OsStr::new("--disable-blink-features=AutomationControlled")];

    let launch_options = LaunchOptionsBuilder::default()
        .path(Some(exe_path.clone()))
        .user_data_dir(Some(profile_dir.clone()))
        .headless(!is_visible)
        .window_size(Some((1280, 800)))
        .args(args)
        .build()
        .map_err(|e| e.to_string())?;

    let browser = Browser::new(launch_options).map_err(|e| e.to_string())?;
    let tab = browser.new_tab().map_err(|e| e.to_string())?;

    let mut all_cookies = Vec::new();

    if is_visible {
        let _ = tab.navigate_to("https://passport.bilibili.com/login");
        
        // Loop until user logs in
        loop {
            std::thread::sleep(std::time::Duration::from_secs(2));
            if let Ok(cookies) = tab.get_cookies() {
                let mut has_sess = false;
                let mut has_jct = false;
                for c in &cookies {
                    if c.domain.contains("bilibili.com") {
                        if c.name == "SESSDATA" { has_sess = true; }
                        if c.name == "bili_jct" { has_jct = true; }
                    }
                }
                if has_sess && has_jct {
                    all_cookies.extend(cookies);
                    break;
                }
            } else {
                return Err("Browser closed manually.".to_string());
            }
        }

        // Quickly grab Chosic before closing
        let _ = tab.navigate_to("https://www.chosic.com/music-genre-finder");
        std::thread::sleep(std::time::Duration::from_secs(2));
        if let Ok(cookies) = tab.get_cookies() {
            all_cookies.extend(cookies);
        }

    } else {
        // HEADLESS MODE
        let _ = tab.navigate_to("https://www.bilibili.com");
        std::thread::sleep(std::time::Duration::from_secs(3));
        if let Ok(cookies) = tab.get_cookies() {
            all_cookies.extend(cookies);
        }

        let _ = tab.navigate_to("https://www.chosic.com/music-genre-finder");
        std::thread::sleep(std::time::Duration::from_secs(2));
        if let Ok(cookies) = tab.get_cookies() {
            all_cookies.extend(cookies);
        }
    }

    Ok(all_cookies)
}

// Removed `async`. This runs safely on a blocking thread pool now!
#[tauri::command]
pub async fn engine_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<EngineState>();
    let profile_dir = app.path().app_local_data_dir().unwrap().join("cloak_profile");
    let bin_dir = profile_dir.join("browser_bin");
    
    let exe_path = find_executable(&bin_dir);
    
    if exe_path.is_none() {
        return Ok(serde_json::json!({
            "isReady": false,
            "isBiliLoggedIn": false,
            "state": {
                "status": *state.download_status.lock().unwrap(),
                "progress": *state.download_progress.lock().unwrap(),
                "error": *state.download_error.lock().unwrap()
            }
        }));
    }

    if *state.is_browser_busy.lock().unwrap() {
        return Ok(serde_json::json!({
            "isReady": true,
            "isBiliLoggedIn": false,
            "status": "busy"
        }));
    }

    let mut should_check = false;
    {
        let mut checked = state.has_checked_background.lock().unwrap();
        if !*checked {
            *checked = true;
            should_check = true;
        }
    }

    if should_check {
        *state.is_browser_busy.lock().unwrap() = true;
        
        // Clone variables to move into the detached thread
        let app_clone = app.clone();
        let profile_clone = profile_dir.clone();
        let exe_clone = exe_path.unwrap().clone();

        // 🚀 THE FIX: Detach the heavy browser launch completely from Tauri's IPC!
        std::thread::spawn(move || {
            let res = launch_and_get_cookies(&profile_clone, &exe_clone, false);
            let bg_state = app_clone.state::<EngineState>();
            
            if let Ok(cookies) = res {
                *bg_state.cached_cookies.lock().unwrap() = Some(cookies);
            }
            // Safely release the lock when finished
            *bg_state.is_browser_busy.lock().unwrap() = false;
        });
        
        // Return instantly to React so the UI doesn't freeze
        return Ok(serde_json::json!({
            "isReady": true,
            "isBiliLoggedIn": false,
            "status": "busy"
        }));
    }

    let cached = state.cached_cookies.lock().unwrap().clone();
    
    let mut bili_obj = serde_json::Map::new();
    let mut chosic_obj = serde_json::Map::new();
    let mut is_bili_logged_in = false;
    let mut total_cookies = 0;

    if let Some(cookies) = cached {
        total_cookies = cookies.len();
        let mut has_sessdata = false;
        let mut has_bili_jct = false;

        for c in cookies {
            if c.domain.contains("bilibili.com") {
                bili_obj.insert(c.name.clone(), serde_json::json!(c.value));
                if c.name == "SESSDATA" { has_sessdata = true; }
                if c.name == "bili_jct" { has_bili_jct = true; }
            } else if c.domain.contains("chosic.com") {
                chosic_obj.insert(c.name.clone(), serde_json::json!(c.value));
            }
        }
        is_bili_logged_in = has_sessdata && has_bili_jct;
    }

    Ok(serde_json::json!({
        "isReady": true,
        "isBiliLoggedIn": is_bili_logged_in,
        "totalCookiesFound": total_cookies,
        "biliCookies": bili_obj,
        "chosicCookies": chosic_obj
    }))
}

// Note: engine_install STAYS async because it uses `tokio::spawn` and `reqwest` internally.
#[tauri::command]
pub async fn engine_install(app: AppHandle) -> Result<(), String> {
    let state = app.state::<EngineState>();
    
    let is_downloading = *state.is_downloading.lock().unwrap();
    if is_downloading { return Ok(()); }
    
    *state.is_downloading.lock().unwrap() = true;
    *state.download_status.lock().unwrap() = "downloading".to_string();
    *state.download_progress.lock().unwrap() = 0;
    *state.download_error.lock().unwrap() = "".to_string();

    let app_clone = app.clone();
    
    tokio::spawn(async move {
        let state = app_clone.state::<EngineState>();
        let profile_dir = app_clone.path().app_local_data_dir().unwrap().join("cloak_profile");
        let bin_dir = profile_dir.join("browser_bin");
        let zip_path = profile_dir.join("browser.zip");

        std::fs::create_dir_all(&bin_dir).unwrap_or_default();

        match reqwest::get(DOWNLOAD_URL).await {
            Ok(res) => {
                let total_size = res.content_length().unwrap_or(0);
                let mut file = File::create(&zip_path).unwrap();
                let mut downloaded: u64 = 0;
                let mut stream = res.bytes_stream();

                while let Some(chunk_result) = stream.next().await {
                    if let Ok(chunk) = chunk_result {
                        file.write_all(&chunk).unwrap();
                        downloaded += chunk.len() as u64;
                        if total_size > 0 {
                            let percentage = ((downloaded as f64 / total_size as f64) * 100.0) as u8;
                            *state.download_progress.lock().unwrap() = percentage;
                        }
                    }
                }

                *state.download_status.lock().unwrap() = "extracting".to_string();
                
                if let Ok(file) = File::open(&zip_path) {
                    if let Ok(mut archive) = zip::ZipArchive::new(file) {
                        if archive.extract(&bin_dir).is_ok() {
                            *state.download_status.lock().unwrap() = "ready".to_string();
                            *state.download_progress.lock().unwrap() = 100;
                            let _ = std::fs::remove_file(&zip_path); 
                        } else {
                            *state.download_status.lock().unwrap() = "error".to_string();
                            *state.download_error.lock().unwrap() = "Failed to extract ZIP".to_string();
                        }
                    }
                }
            },
            Err(e) => {
                *state.download_status.lock().unwrap() = "error".to_string();
                *state.download_error.lock().unwrap() = e.to_string();
            }
        }
        *state.is_downloading.lock().unwrap() = false;
    });

    Ok(())
}

// Removed `async`. Safe execution on Tauri's blocking threads!
#[tauri::command]
pub async fn engine_login(app: AppHandle) -> Result<(), String> {
    let state = app.state::<EngineState>();
    
    if *state.is_browser_busy.lock().unwrap() {
        return Err("Browser is already launching.".to_string());
    }

    let profile_dir = app.path().app_local_data_dir().unwrap().join("cloak_profile");
    let bin_dir = profile_dir.join("browser_bin");
    let exe_path = find_executable(&bin_dir).ok_or("Executable not found.")?;

    *state.is_browser_busy.lock().unwrap() = true;
    
    let app_clone = app.clone();

    // 🚀 THE FIX: Detach the visible browser loop so React gets an immediate success response!
    std::thread::spawn(move || {
        let res = launch_and_get_cookies(&profile_dir, &exe_path, true);
        let bg_state = app_clone.state::<EngineState>();
        
        if let Ok(cookies) = res {
            *bg_state.cached_cookies.lock().unwrap() = Some(cookies);
        }
        // Safely release the lock when finished or closed
        *bg_state.is_browser_busy.lock().unwrap() = false;
    });

    Ok(())
}