use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::plot_history::{
    PlotHistoryEntry, PlotHistoryManager, DEFAULT_PLOT_HEIGHT, DEFAULT_PLOT_WIDTH,
    PLOT_HISTORY_SUBDIR,
};
use crate::PlotInfo;
use anyhow::Result;
use base64::Engine;
use tokio::fs;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

const PERSISTENT_WRAPPER_TEMPLATE: &str = include_str!("../r_scripts/persistent_wrapper.R");
const ONESHOT_WRAPPER_TEMPLATE: &str = include_str!("../r_scripts/oneshot_wrapper.R");

pub const PERSISTENT_DELIMITER: &str = "---REPROD-PERSIST-END---";

#[derive(Clone)]
pub struct CapturedPlot {
    pub info: PlotInfo,
    pub data: Vec<u8>,
    pub snapshot: Option<Vec<u8>>,
}

pub struct PlotCapture {
    temp_dir: PathBuf,
    plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
}

impl PlotCapture {
    pub fn new(
        temp_dir: PathBuf,
        plot_history: Option<Arc<AsyncMutex<PlotHistoryManager>>>,
    ) -> Self {
        Self {
            temp_dir,
            plot_history,
        }
    }

    pub fn wrap_code(
        &self,
        code: &str,
        plot_prefix: &str,
        plot_width: u32,
        plot_height: u32,
        persistent: bool,
    ) -> String {
        let temp_dir_str = r_escape(&self.temp_dir.to_string_lossy());
        let plot_width_str = plot_width.to_string();
        let plot_height_str = plot_height.to_string();

        if persistent {
            PERSISTENT_WRAPPER_TEMPLATE
                .replace("__TEMP_DIR__", &temp_dir_str)
                .replace("__PLOT_PREFIX__", plot_prefix)
                .replace("__PLOT_WIDTH__", &plot_width_str)
                .replace("__PLOT_HEIGHT__", &plot_height_str)
                .replace("__CODE__", code)
                .replace("__DELIMITER__", PERSISTENT_DELIMITER)
        } else {
            ONESHOT_WRAPPER_TEMPLATE
                .replace("__TEMP_DIR__", &temp_dir_str)
                .replace("__PLOT_PREFIX__", plot_prefix)
                .replace("__PLOT_WIDTH__", &plot_width_str)
                .replace("__PLOT_HEIGHT__", &plot_height_str)
                .replace("__CODE__", code)
        }
    }

    pub async fn collect(
        &self,
        plot_prefix: &str,
        plot_width: u32,
        plot_height: u32,
    ) -> Result<Vec<CapturedPlot>> {
        let mut plots = Vec::new();
        let mut index = 1u32;

        loop {
            let filename = format!("{}_{}.png", plot_prefix, index);
            let path = self.temp_dir.join(&filename);
            let snapshot_path = self.temp_dir.join(format!("{}_{}.rds", plot_prefix, index));

            if !path.exists() {
                break;
            }

            let data = fs::read(&path).await?;
            let base64_data = base64::engine::general_purpose::STANDARD.encode(&data);
            let timestamp = now_ms();
            let snapshot_bytes = if snapshot_path.exists() {
                let bytes = fs::read(&snapshot_path).await.ok();
                let _ = fs::remove_file(&snapshot_path).await;
                bytes
            } else {
                None
            };
            let snapshot_path_str = snapshot_bytes
                .as_ref()
                .and_then(|_| snapshot_path.to_str().map(|s| s.to_string()));

            plots.push(CapturedPlot {
                info: PlotInfo {
                    id: Uuid::new_v4().to_string(),
                    filename,
                    base64_data,
                    index,
                    width: Some(plot_width),
                    height: Some(plot_height),
                    timestamp: Some(timestamp),
                    code: None,
                    storage_path: None,
                    snapshot_path: snapshot_path_str.clone(),
                },
                data,
                snapshot: snapshot_bytes,
            });

            let _ = fs::remove_file(&path).await;

            index += 1;
        }

        Ok(plots)
    }

    pub async fn finalize_plots(
        &self,
        mut captures: Vec<CapturedPlot>,
        code: &str,
    ) -> Result<(Vec<PlotInfo>, Vec<PlotHistoryEntry>)> {
        let mut plots = Vec::with_capacity(captures.len());
        let mut history_entries = Vec::new();

        for mut capture in captures.drain(..) {
            capture.info.code = Some(code.to_string());

            if let Some(manager) = &self.plot_history {
                let mut manager = manager.lock().await;
                let meta = manager.add_plot(
                    Some(capture.info.id.clone()),
                    capture.info.width.unwrap_or(DEFAULT_PLOT_WIDTH),
                    capture.info.height.unwrap_or(DEFAULT_PLOT_HEIGHT),
                    &capture.data,
                    capture.snapshot.as_deref(),
                    Some(code.to_string()),
                    capture.info.timestamp.map(|t| t as i64),
                )?;

                let storage_relative = format!("{}/{}", PLOT_HISTORY_SUBDIR, meta.filename);
                capture.info.filename = storage_relative.clone();
                capture.info.storage_path = Some(storage_relative.clone());
                if let Some(snapshot_filename) = meta.snapshot_filename {
                    let snapshot_rel = format!("{}/{}", PLOT_HISTORY_SUBDIR, snapshot_filename);
                    capture.info.snapshot_path = Some(snapshot_rel);
                }

                history_entries.push(PlotHistoryEntry {
                    id: meta.id.clone(),
                    timestamp: meta.timestamp,
                    width: meta.width,
                    height: meta.height,
                    filename: storage_relative.clone(),
                    storage_path: storage_relative,
                    data: capture.info.base64_data.clone(),
                    code: meta.code.clone(),
                    snapshot_path: capture.info.snapshot_path.clone(),
                });
            }

            plots.push(capture.info);
        }

        Ok((plots, history_entries))
    }
}

fn r_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persistent_wrapper_does_not_quit_or_save_image() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let capture = PlotCapture::new(temp_dir.path().to_path_buf(), None);

        let wrapped = capture.wrap_code(
            "x <- 1",
            "pfx",
            DEFAULT_PLOT_WIDTH,
            DEFAULT_PLOT_HEIGHT,
            true,
        );

        assert!(
            !wrapped.contains("save.image"),
            "Persistent wrapper should not save image per call"
        );
        assert!(
            !wrapped.contains("quit("),
            "Persistent wrapper should not quit the R process"
        );
        assert!(
            wrapped.contains(PERSISTENT_DELIMITER),
            "Persistent wrapper must emit delimiter"
        );
    }
}
