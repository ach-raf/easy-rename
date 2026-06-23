mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::list_files,
            commands::rename_pairs,
            commands::undo,
            commands::load_presets,
            commands::save_presets,
            commands::load_last_rename,
            commands::save_last_rename,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
