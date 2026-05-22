use tauri::{AppHandle, Manager, Window, Emitter};
// Note: Removed tauri_plugin_shell::ShellExt since we no longer spawn a sidecar
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
// Note: std::io::Write is no longer needed for the TCP shutdown

mod engine; 
use engine::{engine_status, engine_install, engine_login, EngineState};
use std::sync::Mutex;

#[cfg(windows)]
use windows::{
    core::PCWSTR,
    Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
    Win32::UI::Shell::{
        DefSubclassProc, SetWindowSubclass, ITaskbarList3, TaskbarList, THUMBBUTTON,
        THBF_ENABLED, THB_ICON, THB_TOOLTIP, THBN_CLICKED,
    },
    Win32::UI::WindowsAndMessaging::{WM_COMMAND, LoadImageW, IMAGE_ICON, LR_LOADFROMFILE},
};

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

// Cleaned up static globals using native const atomic declarations
static BUTTONS_ADDED: AtomicBool = AtomicBool::new(false);
static IS_PLAYING_STATE: AtomicBool = AtomicBool::new(false);

#[derive(serde::Deserialize)]
struct TaskbarPayload {
    #[serde(rename = "isPlaying")]
    is_playing: bool,
}

#[cfg(windows)]
unsafe extern "system" fn taskbar_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uid_subclass: usize,
    _ref_data: usize,
) -> LRESULT {
    if msg == WM_COMMAND {
        let high_word = (wparam.0 >> 16) & 0xFFFF;
        let button_id = wparam.0 & 0xFFFF;

        if high_word == THBN_CLICKED as usize {
            if let Some(app) = APP_HANDLE.get() {
                match button_id {
                    101 => { app.emit("taskbar-prev", ()).ok(); }
                    102 => { 
                        // THE FIX: The middle slot ID is now permanently 102.
                        if IS_PLAYING_STATE.load(Ordering::Relaxed) {
                            app.emit("taskbar-pause", ()).ok();
                        } else {
                            app.emit("taskbar-play", ()).ok();
                        }
                    }
                    104 => { app.emit("taskbar-next", ()).ok(); }
                    _ => {}
                };
            }
        }
    }
    
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

#[cfg(windows)]
fn encode_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn encode_wide_fixed(s: &str) -> [u16; 260] {
    let mut arr = [0u16; 260];
    for (i, c) in s.encode_utf16().enumerate().take(259) {
        arr[i] = c;
    }
    arr
}

#[cfg(windows)]
unsafe fn render_native_buttons(hwnd: HWND, is_playing: bool) {
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    if let Ok(taskbar) = CoCreateInstance::<_, ITaskbarList3>(&TaskbarList, None, CLSCTX_ALL) {
        let _ = taskbar.HrInit();

        let mut current_dir = std::env::current_dir().unwrap();
        if current_dir.join("src-tauri").exists() {
            current_dir = current_dir.join("src-tauri");
        }
        let icons_dir = current_dir.join("icons");

        let prev_path = icons_dir.join("prev.ico");
        let play_path = icons_dir.join("play.ico");
        let pause_path = icons_dir.join("pause.ico");
        let next_path = icons_dir.join("next.ico");

        let prev_wide = encode_wide(prev_path.to_str().unwrap());
        let play_wide = encode_wide(play_path.to_str().unwrap());
        let pause_wide = encode_wide(pause_path.to_str().unwrap());
        let next_wide = encode_wide(next_path.to_str().unwrap());

        let hicon_prev = LoadImageW(None, PCWSTR(prev_wide.as_ptr()), IMAGE_ICON, 16, 16, LR_LOADFROMFILE).unwrap_or_default();
        let hicon_play = LoadImageW(None, PCWSTR(play_wide.as_ptr()), IMAGE_ICON, 16, 16, LR_LOADFROMFILE).unwrap_or_default();
        let hicon_pause = LoadImageW(None, PCWSTR(pause_wide.as_ptr()), IMAGE_ICON, 16, 16, LR_LOADFROMFILE).unwrap_or_default();
        let hicon_next = LoadImageW(None, PCWSTR(next_wide.as_ptr()), IMAGE_ICON, 16, 16, LR_LOADFROMFILE).unwrap_or_default();

        let buttons = vec![
            THUMBBUTTON { dwMask: THB_ICON | THB_TOOLTIP, iId: 101, iBitmap: 0, hIcon: std::mem::transmute(hicon_prev), szTip: encode_wide_fixed("Previous"), dwFlags: THBF_ENABLED },
            THUMBBUTTON { dwMask: THB_ICON | THB_TOOLTIP, iId: 102, iBitmap: 0, hIcon: std::mem::transmute(if is_playing { hicon_pause } else { hicon_play }), szTip: encode_wide_fixed(if is_playing { "Pause" } else { "Play" }), dwFlags: THBF_ENABLED },
            THUMBBUTTON { dwMask: THB_ICON | THB_TOOLTIP, iId: 104, iBitmap: 0, hIcon: std::mem::transmute(hicon_next), szTip: encode_wide_fixed("Next"), dwFlags: THBF_ENABLED },
        ];

        if !BUTTONS_ADDED.load(Ordering::Relaxed) {
            if taskbar.ThumbBarAddButtons(hwnd, &buttons).is_ok() {
                BUTTONS_ADDED.store(true, Ordering::Relaxed);
            }
        } else {
            let _ = taskbar.ThumbBarUpdateButtons(hwnd, &buttons);
        }
    }
}

#[tauri::command]
fn update_taskbar(window: Window, payload: TaskbarPayload) {
    #[cfg(windows)]
    unsafe {
        if let Ok(hwnd_ptr) = window.hwnd() {
            IS_PLAYING_STATE.store(payload.is_playing, Ordering::Relaxed);
            render_native_buttons(HWND(hwnd_ptr.0 as _), payload.is_playing);
        }
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        
        // 1. Manage our native Engine State
        .manage(EngineState {
            is_downloading: Mutex::new(false),
            download_progress: Mutex::new(0),
            download_status: Mutex::new("idle".to_string()), 
            download_error: Mutex::new("".to_string()),      
            is_browser_busy: Mutex::new(false),
            has_checked_background: Mutex::new(false),
            cached_cookies: Mutex::new(None),             
        })
        
        // 2. Register all commands exactly once
        .invoke_handler(tauri::generate_handler![
            greet, 
            update_taskbar,
            engine_status,
            engine_install,
            engine_login
        ])
        
        .setup(|app| {
            APP_HANDLE.set(app.handle().clone()).unwrap();

            #[cfg(windows)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let hwnd = HWND(window.hwnd().unwrap().0 as _);
                    
                    unsafe {
                        let _ = SetWindowSubclass(hwnd, Some(taskbar_subclass_proc), 0, 0);
                    }
                    
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(150));
                        unsafe {
                            render_native_buttons(hwnd, false);
                        }
                    });
                }
            }
            
            // Sidecar spawning code has been entirely deleted!

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        
        // TCP Shutdown hook has been entirely deleted!
        .run(|_app_handle, _event| {});
}