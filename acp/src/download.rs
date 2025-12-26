use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde::Deserialize;
use tracing::{info, warn};

use reprod_core::config::{acp_auto_download_enabled, app_config_dir};

const CODEX_ACP_REPO: &str = "zed-industries/codex-acp";
const ACP_AGENT_DIR: &str = "acp_agents";
const USER_AGENT: &str = "reprod-acp";

#[cfg(windows)]
const CODEX_ACP_BIN: &str = "codex-acp.exe";
#[cfg(not(windows))]
const CODEX_ACP_BIN: &str = "codex-acp";

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

pub async fn ensure_codex_acp_available() -> Result<Option<PathBuf>> {
    if !acp_auto_download_enabled() {
        return Ok(None);
    }

    if let Some(path) = cached_codex_acp()? {
        return Ok(Some(path));
    }

    info!("Codex ACP not found; downloading latest release");
    let release = fetch_latest_release().await?;
    let target = host_target()?;
    let asset = select_asset(&release, &target).ok_or_else(|| {
        let names: Vec<String> = release.assets.iter().map(|asset| asset.name.clone()).collect();
        anyhow!(
            "Codex ACP asset not found for target {target}. Available assets: {names:?}"
        )
    })?;
    let bin_path = download_and_install(&release, asset).await?;
    Ok(Some(bin_path))
}

fn cache_root() -> Result<PathBuf> {
    Ok(app_config_dir()?.join(ACP_AGENT_DIR).join("codex-acp"))
}

fn current_bin_path(root: &Path) -> PathBuf {
    root.join("current").join(CODEX_ACP_BIN)
}

fn cached_codex_acp() -> Result<Option<PathBuf>> {
    let root = cache_root()?;
    let current = current_bin_path(&root);
    if current.exists() {
        return Ok(Some(current));
    }
    Ok(None)
}

async fn fetch_latest_release() -> Result<GithubRelease> {
    let url = format!("https://api.github.com/repos/{CODEX_ACP_REPO}/releases/latest");
    let client = Client::new();
    let response = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .context("Failed to fetch latest Codex ACP release")?;
    if !response.status().is_success() {
        bail!(
            "Failed to fetch latest Codex ACP release: HTTP {}",
            response.status()
        );
    }
    response
        .json::<GithubRelease>()
        .await
        .context("Failed to parse Codex ACP release metadata")
}

fn host_target() -> Result<String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let target = match (os, arch) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("linux", "aarch64") => "aarch64-unknown-linux-gnu",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        ("windows", "aarch64") => "aarch64-pc-windows-msvc",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        _ => bail!("Unsupported platform: {os} {arch}"),
    };
    Ok(target.to_string())
}

fn select_asset<'a>(release: &'a GithubRelease, target: &str) -> Option<&'a GithubAsset> {
    let target_lower = target.to_lowercase();
    let mut candidates: Vec<&GithubAsset> = release
        .assets
        .iter()
        .filter(|asset| {
            let name = asset.name.to_lowercase();
            name.contains("codex-acp") && name.contains(&target_lower)
        })
        .collect();

    if candidates.is_empty() {
        candidates = release
            .assets
            .iter()
            .filter(|asset| asset.name.to_lowercase().contains("codex-acp"))
            .collect();
    }

    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by_key(|asset| asset.name.len());
    candidates.into_iter().next()
}

async fn download_and_install(release: &GithubRelease, asset: &GithubAsset) -> Result<PathBuf> {
    let root = cache_root()?;
    let version_dir = root.join(&release.tag_name);
    fs::create_dir_all(&version_dir)?;

    let tmp_path = version_dir.join(&asset.name);
    let client = Client::new();
    let response = client
        .get(&asset.browser_download_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .context("Failed to download Codex ACP binary")?;
    if !response.status().is_success() {
        bail!(
            "Failed to download Codex ACP binary: HTTP {}",
            response.status()
        );
    }
    let bytes = response.bytes().await?;
    fs::write(&tmp_path, &bytes)?;

    let bin_path = if asset.name.ends_with(".zip") {
        extract_zip(&tmp_path, &version_dir)?;
        find_binary(&version_dir).ok_or_else(|| anyhow!("codex-acp binary not found in zip"))?
    } else if asset.name.ends_with(".tar.gz") || asset.name.ends_with(".tgz") {
        extract_tar_gz(&tmp_path, &version_dir)?;
        find_binary(&version_dir).ok_or_else(|| anyhow!("codex-acp binary not found in tar.gz"))?
    } else {
        let bin_path = version_dir.join(CODEX_ACP_BIN);
        fs::write(&bin_path, &bytes)?;
        bin_path
    };

    if let Err(err) = fs::remove_file(&tmp_path) {
        warn!(error = %err, path = %tmp_path.display(), "Failed to clean temporary download");
    }

    ensure_executable(&bin_path)?;

    let current_dir = root.join("current");
    fs::create_dir_all(&current_dir)?;
    let current_bin = current_bin_path(&root);
    fs::copy(&bin_path, &current_bin)?;
    ensure_executable(&current_bin)?;

    info!(
        path = %current_bin.display(),
        version = release.tag_name.as_str(),
        "Codex ACP cached"
    );

    Ok(current_bin)
}

fn extract_zip(archive_path: &Path, dest: &Path) -> Result<()> {
    let file = fs::File::open(archive_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let entry_path = match entry.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue,
        };
        let out_path = dest.join(entry_path);
        if entry.is_dir() {
            fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut outfile = fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut outfile)?;
    }
    Ok(())
}

fn extract_tar_gz(archive_path: &Path, dest: &Path) -> Result<()> {
    let file = fs::File::open(archive_path)?;
    let decoder = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);
    for entry in archive.entries()? {
        let mut entry = entry?;
        entry.unpack_in(dest)?;
    }
    Ok(())
}

fn find_binary(root: &Path) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().and_then(|name| name.to_str()) == Some(CODEX_ACP_BIN) {
                return Some(path);
            }
        }
    }
    None
}

fn ensure_executable(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)?.permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}
