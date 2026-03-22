// pmVPN Tauri App — desktop + mobile
// GPL-3.0
//
// The frontend (vite + vanilla TypeScript) runs in the system webview.
// This Rust backend provides the native shell. The actual SSH/SFTP
// connection happens via WebSocket to the pmVPN server — no Rust SSH
// client needed in this build.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running pmVPN");
}
