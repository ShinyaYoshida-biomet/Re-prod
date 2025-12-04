use std::{env, fs, path::PathBuf};

fn ensure_sidecar_placeholder() {
    let triple = env::var("TAURI_ENV_TARGET_TRIPLE")
        .ok()
        .or_else(|| env::var("TARGET").ok());

    #[cfg(target_os = "windows")]
    let ext = ".exe";
    #[cfg(not(target_os = "windows"))]
    let ext = "";

    let base = "reprod-server";
    let filename = match triple {
        Some(t) if !t.is_empty() => format!("{base}-{t}{ext}"),
        _ => format!("{base}{ext}"),
    };

    let path: PathBuf = ["binaries", &filename].iter().collect();
    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        // Placeholder will be replaced by build-server script during bundling.
        let _ = fs::write(&path, b"");
    }
}

fn main() {
    ensure_sidecar_placeholder();
    tauri_build::build()
}
