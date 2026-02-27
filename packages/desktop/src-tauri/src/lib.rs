mod markdown;

use std::{
    env,
    net::TcpListener,
    path::PathBuf,
    process::Child,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ServerReadyData {
    url: String,
    username: Option<String>,
    password: Option<String>,
    is_sidecar: bool,
}

#[derive(Default)]
struct ServerState {
    child: Mutex<Option<Child>>,
    ready: Mutex<Option<ServerReadyData>>,
}

fn find_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn sidecar_path() -> Result<std::path::PathBuf, String> {
    let current = std::env::current_exe().map_err(|err| err.to_string())?;
    let directory = current
        .parent()
        .ok_or_else(|| "Failed to resolve desktop binary directory".to_string())?;
    let path = directory.join("buddy-backend");
    if path.exists() {
        return Ok(path);
    }
    #[cfg(target_os = "windows")]
    {
        let windows_path = directory.join("buddy-backend.exe");
        if windows_path.exists() {
            return Ok(windows_path);
        }
    }
    Err(format!("Buddy backend sidecar not found at {}", path.display()))
}

fn resource_migrations_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let root = resource_dir.join("migrations");
        if root.exists() {
            return Ok(root);
        }
    }

    let dev_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/migrations");
    if dev_root.exists() {
        return Ok(dev_root);
    }

    Err("Bundled migrations were not found in the desktop app resources".to_string())
}

fn user_home_dir() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
        .or_else(|| {
            let drive = env::var_os("HOMEDRIVE")?;
            let path = env::var_os("HOMEPATH")?;
            let mut combined = PathBuf::from(drive);
            combined.push(path);
            Some(combined)
        })
        .unwrap_or_else(|| env::temp_dir())
}

async fn wait_for_health(url: &str, username: &str, password: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
        .map_err(|err| err.to_string())?;

    for _ in 0..100 {
        let response = client
            .get(format!("{url}/api/health"))
            .basic_auth(username, Some(password))
            .send()
            .await;

        if let Ok(response) = response {
            if response.status().is_success() {
                return Ok(());
            }
        }

        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    Err("Timed out waiting for Buddy backend to become ready".to_string())
}

#[tauri::command]
async fn await_initialization(
    app: AppHandle,
    state: State<'_, ServerState>,
) -> Result<ServerReadyData, String> {
    if let Some(ready) = state.ready.lock().unwrap().clone() {
        return Ok(ready);
    }

    let port = find_free_port()?;
    let username = "buddy".to_string();
    let password = format!(
        "buddy-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|err| err.to_string())?
            .as_nanos()
    );
    let url = format!("http://127.0.0.1:{port}");
    let migration_root = resource_migrations_root(&app)?;
    let buddy_migration_dir = migration_root.join("buddy");
    let opencode_migration_dir = migration_root.join("opencode");
    let home_dir = user_home_dir();
    let allowed_roots = format!("{},{}", home_dir.display(), std::env::temp_dir().display());

    let stdout = if cfg!(debug_assertions) {
        std::process::Stdio::inherit()
    } else {
        std::process::Stdio::null()
    };
    let stderr = if cfg!(debug_assertions) {
        std::process::Stdio::inherit()
    } else {
        std::process::Stdio::null()
    };

    let mut child = std::process::Command::new(sidecar_path()?)
        .env("PORT", port.to_string())
        .env("BUDDY_SERVER_USERNAME", &username)
        .env("BUDDY_SERVER_PASSWORD", &password)
        .env("BUDDY_MIGRATION_DIR", &buddy_migration_dir)
        .env("OPENCODE_MIGRATION_DIR", &opencode_migration_dir)
        .env("BUDDY_ALLOWED_DIRECTORY_ROOTS", &allowed_roots)
        .current_dir(&home_dir)
        .stdout(stdout)
        .stderr(stderr)
        .spawn()
        .map_err(|err| format!("Failed to start Buddy backend: {err}"))?;

    if let Err(error) = wait_for_health(&url, &username, &password).await {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    let ready = ServerReadyData {
        url,
        username: Some(username),
        password: Some(password),
        is_sidecar: true,
    };

    *state.child.lock().unwrap() = Some(child);
    *state.ready.lock().unwrap() = Some(ready.clone());

    if app.get_webview_window("main").is_none() {
        WebviewWindowBuilder::new(&app, "main", WebviewUrl::App("/".into()))
            .title("Buddy Dev")
            .visible(true)
            .build()
            .map_err(|err| err.to_string())?;
    }

    Ok(ready)
}

fn kill_sidecar(state: &ServerState) {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ServerState::default())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            await_initialization,
            markdown::parse_markdown_command
        ])
        .setup(|app| {
            if app.get_webview_window("main").is_none() {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
                    .title("Buddy Dev")
                    .visible(true)
                    .build()?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Buddy desktop")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerState>() {
                    kill_sidecar(&state);
                }
            }
        });
}
