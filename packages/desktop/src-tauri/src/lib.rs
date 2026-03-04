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
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};
use tokio::sync::mpsc;

#[derive(Clone, Serialize, specta::Type)]
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

const UPDATER_ENABLED: bool = matches!(option_env!("TAURI_SIGNING_PRIVATE_KEY"), Some(value) if !value.is_empty())
    || matches!(option_env!("TAURI_SIGNING_PRIVATE_KEY_PATH"), Some(value) if !value.is_empty());

fn window_state_flags() -> StateFlags {
    StateFlags::all() - StateFlags::DECORATIONS - StateFlags::VISIBLE
}

fn setup_window_state_listener(app: &AppHandle, window: &WebviewWindow) {
    let (tx, mut rx) = mpsc::channel::<()>(1);

    window.on_window_event(move |event| {
        use tauri::WindowEvent;

        if !matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
            return;
        }

        let _ = tx.try_send(());
    });

    tauri::async_runtime::spawn({
        let app = app.clone();

        async move {
            while rx.recv().await.is_some() {
                tokio::time::sleep(Duration::from_millis(200)).await;

                let handle = app.clone();
                let save_app = app.clone();
                let _ = handle.run_on_main_thread(move || {
                    let _ = save_app.save_window_state(window_state_flags());
                });
            }
        }
    });
}

fn ensure_main_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
        let _ = window.unminimize();
        return Ok(());
    }

    let window_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
        .title("Buddy Dev")
        .visible(true)
        .initialization_script(format!(
            r#"
            window.__BUDDY__ ??= {{}};
            window.__BUDDY__.updaterEnabled = {UPDATER_ENABLED};
          "#
        ));

    #[cfg(target_os = "windows")]
    let window_builder = window_builder.decorations(false);

    #[cfg(target_os = "macos")]
    let window_builder = window_builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(12.0, 18.0));

    let window = window_builder.build()?;

    let _ = window.set_focus();
    setup_window_state_listener(app, &window);

    #[cfg(windows)]
    {
        use tauri_plugin_decorum::WebviewWindowExt;

        let _ = window.create_overlay_titlebar();
    }

    Ok(())
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
#[specta::specta]
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

    ensure_main_window(&app).map_err(|err| err.to_string())?;

    Ok(ready)
}

fn kill_sidecar_process(state: &ServerState) {
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
#[specta::specta]
fn kill_sidecar(app: AppHandle) {
    if let Some(state) = app.try_state::<ServerState>() {
        kill_sidecar_process(&state);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let bindings = make_specta_builder();

    #[cfg(debug_assertions)]
    export_types(&bindings);

    let mut builder = tauri::Builder::default()
        .manage(ServerState::default())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags())
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(bindings.invoke_handler())
        .setup(|app| {
            ensure_main_window(&app.handle())?;

            Ok(())
        });

    if UPDATER_ENABLED {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while running Buddy desktop")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ServerState>() {
                    kill_sidecar_process(&state);
                }
            }
        });
}

fn make_specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            kill_sidecar,
            await_initialization,
            markdown::parse_markdown_command
        ])
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
}

#[cfg(any(debug_assertions, test))]
fn export_types(builder: &tauri_specta::Builder<tauri::Wry>) {
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");
}

#[cfg(test)]
#[test]
fn test_export_types() {
    let builder = make_specta_builder();
    export_types(&builder);
}
