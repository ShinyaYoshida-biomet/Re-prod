use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use reqwest::Client;
use serde::Deserialize;
use tracing::{info, warn};

use crate::config::{acp_auto_download_enabled, app_config_dir};

use super::agents::{AgentDescriptor, AgentDownload, GithubReleaseSpec};

const ACP_AGENT_DIR: &str = "acp_agents";
const USER_AGENT: &str = "reprod-acp";

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

pub async fn ensure_agent_available(agent: &AgentDescriptor) -> Result<Option<PathBuf>> {
    if !acp_auto_download_enabled() {
        return Ok(None);
    }

    let Some(download) = agent.download else {
        return Ok(None);
    };

    match download {
        AgentDownload::GithubRelease(spec) => ensure_github_release_available(agent, spec).await,
    }
}

async fn ensure_github_release_available(
    agent: &AgentDescriptor,
    spec: GithubReleaseSpec,
) -> Result<Option<PathBuf>> {
    if let Some(path) = cached_agent_binary(agent.id, spec.binary_name)? {
        return Ok(Some(path));
    }

    info!(agent = agent.name, "ACP agent not found; downloading latest release");
    let release = fetch_latest_release(spec.repo, agent.name).await?;
    let target = host_target()?;
    let asset = select_asset(&release, &target, spec.asset_prefix).ok_or_else(|| {
        let names: Vec<String> = release.assets.iter().map(|asset| asset.name.clone()).collect();
        anyhow!(
            "ACP asset not found for agent {agent} target {target}. Available assets: {names:?}",
            agent = agent.name
        )
    })?;
    let bin_path = download_and_install(agent, spec, &release, asset).await?;
    Ok(Some(bin_path))
}

fn cache_root(agent_id: &str) -> Result<PathBuf> {
    Ok(app_config_dir()?.join(ACP_AGENT_DIR).join(agent_id))
}

fn platform_binary_name(base: &str) -> String {
    #[cfg(windows)]
    {
        format!("{base}.exe")
    }
    #[cfg(not(windows))]
    {
        base.to_string()
    }
}

fn current_bin_path(root: &Path, bin_name: &str) -> PathBuf {
    root.join("current").join(bin_name)
}

fn cached_agent_binary(agent_id: &str, binary_name: &str) -> Result<Option<PathBuf>> {
    let root = cache_root(agent_id)?;
    let bin_name = platform_binary_name(binary_name);
    let current = current_bin_path(&root, &bin_name);
    if current.exists() {
        return Ok(Some(current));
    }
    Ok(None)
}

async fn fetch_latest_release(repo: &str, agent_name: &str) -> Result<GithubRelease> {
    let url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let client = Client::new();
    let response = client
        .get(url)
        .header("User-Agent", USER_AGENT)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .with_context(|| format!("Failed to fetch latest {agent_name} release"))?;
    if !response.status().is_success() {
        bail!(
            "Failed to fetch latest {agent_name} release: HTTP {}",
            response.status()
        );
    }
    response
        .json::<GithubRelease>()
        .await
        .with_context(|| format!("Failed to parse {agent_name} release metadata"))
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

fn select_asset<'a>(
    release: &'a GithubRelease,
    target: &str,
    asset_prefix: &str,
) -> Option<&'a GithubAsset> {
    let target_lower = target.to_lowercase();
    let prefix_lower = asset_prefix.to_lowercase();
    let mut candidates: Vec<&GithubAsset> = release
        .assets
        .iter()
        .filter(|asset| {
            let name = asset.name.to_lowercase();
            name.contains(&prefix_lower) && name.contains(&target_lower)
        })
        .collect();

    if candidates.is_empty() {
        candidates = release
            .assets
            .iter()
            .filter(|asset| asset.name.to_lowercase().contains(&prefix_lower))
            .collect();
    }

    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by_key(|asset| asset.name.len());
    candidates.into_iter().next()
}

async fn download_and_install(
    agent: &AgentDescriptor,
    spec: GithubReleaseSpec,
    release: &GithubRelease,
    asset: &GithubAsset,
) -> Result<PathBuf> {
    let root = cache_root(agent.id)?;
    let version_dir = root.join(&release.tag_name);
    fs::create_dir_all(&version_dir)?;

    let tmp_path = version_dir.join(&asset.name);
    let client = Client::new();
    let response = client
        .get(&asset.browser_download_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .with_context(|| format!("Failed to download {} binary", agent.name))?;
    if !response.status().is_success() {
        bail!(
            "Failed to download {} binary: HTTP {}",
            agent.name,
            response.status()
        );
    }
    let bytes = response.bytes().await?;
    fs::write(&tmp_path, &bytes)?;

    let bin_name = platform_binary_name(spec.binary_name);
    let bin_path = if asset.name.ends_with(".zip") {
        extract_zip(&tmp_path, &version_dir)?;
        find_binary(&version_dir, &bin_name)
            .ok_or_else(|| anyhow!("{bin_name} binary not found in zip"))?
    } else if asset.name.ends_with(".tar.gz") || asset.name.ends_with(".tgz") {
        extract_tar_gz(&tmp_path, &version_dir)?;
        find_binary(&version_dir, &bin_name)
            .ok_or_else(|| anyhow!("{bin_name} binary not found in tar.gz"))?
    } else {
        let bin_path = version_dir.join(&bin_name);
        fs::write(&bin_path, &bytes)?;
        bin_path
    };

    if let Err(err) = fs::remove_file(&tmp_path) {
        warn!(error = %err, path = %tmp_path.display(), "Failed to clean temporary download");
    }

    ensure_executable(&bin_path)?;

    let current_dir = root.join("current");
    fs::create_dir_all(&current_dir)?;
    let current_bin = current_bin_path(&root, &bin_name);
    fs::copy(&bin_path, &current_bin)?;
    ensure_executable(&current_bin)?;

    info!(
        path = %current_bin.display(),
        version = release.tag_name.as_str(),
        agent = agent.name,
        "ACP agent cached"
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

fn find_binary(root: &Path, bin_name: &str) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.file_name().and_then(|name| name.to_str()) == Some(bin_name) {
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
