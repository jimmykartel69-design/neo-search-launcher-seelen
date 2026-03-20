use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AppEntry {
    id: String,
    title: String,
    path: String,
    kind: String,
    keywords: Vec<String>,
    usage: u64,
}

#[derive(Debug, Default)]
struct AppStateData {
    catalog: Mutex<Vec<AppEntry>>,
    usage: Mutex<HashMap<String, u64>>,
    usage_file: PathBuf,
}

fn normalize_name(name: &str) -> String {
    name.replace('_', " ")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_keywords(name: &str) -> Vec<String> {
    let lower = name.to_lowercase();
    let mut out = vec![lower.clone()];
    for part in lower.split_whitespace() {
        if !out.contains(&part.to_string()) {
            out.push(part.to_string());
        }
    }
    out
}

fn file_stem_title(path: &Path) -> String {
    let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    normalize_name(&stem)
}

fn load_usage_map(path: &Path) -> HashMap<String, u64> {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_usage_map(path: &Path, usage: &HashMap<String, u64>) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(usage) {
        let _ = fs::write(path, json);
    }
}

fn system_apps() -> Vec<(String, String)> {
    vec![
        ("Explorateur Windows".into(), r"C:\Windows\explorer.exe".into()),
        ("Bloc-notes".into(), r"C:\Windows\System32\notepad.exe".into()),
        ("Calculatrice".into(), r"C:\Windows\System32\calc.exe".into()),
        ("Invite de commandes".into(), r"C:\Windows\System32\cmd.exe".into()),
        ("PowerShell".into(), r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe".into()),
        ("Regedit".into(), r"C:\Windows\regedit.exe".into()),
        ("Task Manager".into(), r"C:\Windows\System32\Taskmgr.exe".into())
    ]
    .into_iter()
    .filter(|(_, p)| Path::new(p).exists())
    .collect()
}

fn scan_start_menu_paths() -> Vec<PathBuf> {
    let mut dirs_to_scan = vec![PathBuf::from(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs")];

    if let Some(home) = dirs::home_dir() {
        dirs_to_scan.push(home.join(r"AppData\Roaming\Microsoft\Windows\Start Menu\Programs"));
    }

    dirs_to_scan
}

fn scan_catalog(usage_map: &HashMap<String, u64>) -> Vec<AppEntry> {
    let mut items: Vec<AppEntry> = vec![];

    for dir in scan_start_menu_paths() {
        if !dir.exists() {
            continue;
        }

        for entry in WalkDir::new(dir).into_iter().filter_map(Result::ok) {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }

            let ext = p.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            if ext != "lnk" && ext != "exe" && ext != "url" {
                continue;
            }

            let title = file_stem_title(p);
            let id = p.to_string_lossy().to_string().to_lowercase();
            let usage = *usage_map.get(&id).unwrap_or(&0);

            items.push(AppEntry {
                id,
                title: title.clone(),
                path: p.to_string_lossy().to_string(),
                kind: "App".into(),
                keywords: build_keywords(&title),
                usage,
            });
        }
    }

    for (title, path) in system_apps() {
        let id = path.to_lowercase();
        let usage = *usage_map.get(&id).unwrap_or(&0);

        items.push(AppEntry {
            id,
            title: title.clone(),
            path,
            kind: "System".into(),
            keywords: build_keywords(&title),
            usage,
        });
    }

    let mut unique = HashMap::<String, AppEntry>::new();
    for item in items {
        unique.entry(item.id.clone()).or_insert(item);
    }

    let mut out: Vec<AppEntry> = unique.into_values().collect();
    out.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    out
}

#[tauri::command]
fn get_catalog(state: State<'_, AppStateData>) -> Result<Vec<AppEntry>, String> {
    state.catalog.lock()
        .map(|v| v.clone())
        .map_err(|_| "Impossible de lire le catalogue".into())
}

#[tauri::command]
fn refresh_catalog(state: State<'_, AppStateData>) -> Result<Vec<AppEntry>, String> {
    let usage = state.usage.lock().map_err(|_| "Usage lock error".to_string())?;
    let fresh = scan_catalog(&usage);
    drop(usage);

    let mut catalog = state.catalog.lock().map_err(|_| "Catalog lock error".to_string())?;
    *catalog = fresh.clone();

    Ok(fresh)
}

#[tauri::command]
fn launch_item(path: String, state: State<'_, AppStateData>) -> Result<(), String> {
    let lower_id = path.to_lowercase();

    {
        let mut usage = state.usage.lock().map_err(|_| "Usage lock error".to_string())?;
        let current = usage.get(&lower_id).copied().unwrap_or(0);
        usage.insert(lower_id.clone(), current + 1);
        save_usage_map(&state.usage_file, &usage);
    }

    Command::new("cmd")
        .args(["/C", "start", "", &path])
        .spawn()
        .map_err(|e| format!("Launch failed: {e}"))?;

    Ok(())
}

#[tauri::command]
fn reveal_item(path: String) -> Result<(), String> {
    Command::new("explorer")
        .args(["/select,", &path])
        .spawn()
        .map_err(|e| format!("Reveal failed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn toggle_main_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Fenêtre introuvable")?;
    let visible = window.is_visible().map_err(|e| e.to_string())?;

    if visible {
        window.hide().map_err(|e| e.to_string())?;
    } else {
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_focus();
    }

    Ok(())
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Fenêtre introuvable")?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    let mut usage_file = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    usage_file.push("NeoSearch");
    usage_file.push("usage.json");

    let usage_map = load_usage_map(&usage_file);
    let catalog = scan_catalog(&usage_map);

    tauri::Builder::default()
        .manage(AppStateData {
            catalog: Mutex::new(catalog),
            usage: Mutex::new(usage_map),
            usage_file,
        })
        .invoke_handler(tauri::generate_handler![
            get_catalog,
            refresh_catalog,
            launch_item,
            reveal_item,
            toggle_main_window,
            hide_main_window
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Builder as GlobalShortcutBuilder,
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Space);
                let app_handle = app.handle().clone();
                let shortcut_for_handler = shortcut.clone();

                app.handle().plugin(
                    GlobalShortcutBuilder::new()
                        .with_handler(move |_app, pressed_shortcut, event| {
                            if pressed_shortcut == &shortcut_for_handler
                                && event.state() == ShortcutState::Pressed
                            {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    if let Ok(visible) = window.is_visible() {
                                        if visible {
                                            let _ = window.hide();
                                        } else {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(shortcut)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Erreur Tauri");
}