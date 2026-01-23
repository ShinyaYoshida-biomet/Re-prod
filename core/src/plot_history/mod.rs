use std::collections::VecDeque;
use std::fs;
use std::fs::File;
use std::io::BufWriter;
use std::ops::Not;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::io::Reader as ImageReader;
use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

pub mod constants;
pub use constants::{
    DEFAULT_MAX_PLOTS, DEFAULT_PLOT_HEIGHT, DEFAULT_PLOT_WIDTH, METADATA_FILE, PLOT_HISTORY_SUBDIR,
};

/// Metadata describing a persisted plot image.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlotMetadata {
    pub id: String,
    pub timestamp: i64,
    pub width: u32,
    pub height: u32,
    pub filename: String,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub snapshot_filename: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct PlotHistoryState {
    #[serde(default)]
    active_plot: Option<String>,
    #[serde(default)]
    plots: Vec<PlotMetadata>,
}

/// UI payload for an individual plot, including image data.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PlotHistoryEntry {
    pub id: String,
    #[ts(type = "number")]
    pub timestamp: i64,
    pub width: u32,
    pub height: u32,
    pub filename: String,
    pub storage_path: String,
    pub data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_path: Option<String>,
}

/// Snapshot of the plot history for syncing with the UI.
#[derive(Debug, Clone, Serialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../client/src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct PlotHistorySnapshot {
    pub active_plot_id: Option<String>,
    pub plots: Vec<PlotHistoryEntry>,
}

/// Manages plot history persistence for a single project.
///
/// Images are stored under `{project_root}/.reprod/plots/{uuid}.png` with
/// metadata persisted to `{project_root}/.reprod/plots/plots.json`.
pub struct PlotHistoryManager {
    plots: VecDeque<PlotMetadata>,
    active: Option<usize>,
    storage_path: PathBuf,
    max_plots: usize,
}

impl PlotHistoryManager {
    /// Initialize a manager using the default max size (50 plots).
    pub fn new(storage_path: PathBuf) -> Result<Self> {
        Self::with_max(storage_path, DEFAULT_MAX_PLOTS)
    }

    /// Initialize a manager with a custom capacity.
    pub fn with_max(storage_path: PathBuf, max_plots: usize) -> Result<Self> {
        fs::create_dir_all(&storage_path).with_context(|| {
            format!(
                "Failed to create plot history directory {}",
                storage_path.display()
            )
        })?;

        let mut manager = Self {
            plots: VecDeque::new(),
            active: None,
            storage_path,
            max_plots,
        };
        manager.restore_state()?;
        Ok(manager)
    }

    fn metadata_path(&self) -> PathBuf {
        self.storage_path.join(METADATA_FILE)
    }

    /// Storage directory (relative to project root).
    pub fn storage_dir(&self) -> &Path {
        &self.storage_path
    }

    /// Current active plot metadata, if any.
    pub fn active_plot(&self) -> Option<&PlotMetadata> {
        self.active.and_then(|idx| self.plots.get(idx))
    }

    /// Active plot identifier.
    pub fn active_plot_id(&self) -> Option<String> {
        self.active_plot().map(|plot| plot.id.clone())
    }

    /// All plots in order from oldest to newest.
    pub fn plots(&self) -> Vec<PlotMetadata> {
        self.plots.iter().cloned().collect()
    }

    /// Persist a new plot image and update history.
    #[allow(clippy::too_many_arguments)]
    pub fn add_plot(
        &mut self,
        id: Option<String>,
        width: u32,
        height: u32,
        data: &[u8],
        snapshot: Option<&[u8]>,
        code: Option<String>,
        timestamp: Option<i64>,
    ) -> Result<PlotMetadata> {
        let id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let filename = format!("{}.png", id);
        let path = self.storage_path.join(&filename);
        let snapshot_filename = snapshot.map(|_| format!("{}.rds", id));

        fs::write(&path, data).with_context(|| {
            format!(
                "Failed to write plot {} to {}",
                id,
                self.storage_path.display()
            )
        })?;

        if let Some(snapshot_bytes) = snapshot {
            if let Some(ref name) = snapshot_filename {
                let snapshot_path = self.storage_path.join(name);
                fs::write(&snapshot_path, snapshot_bytes).with_context(|| {
                    format!(
                        "Failed to write plot snapshot {} to {}",
                        id,
                        snapshot_path.display()
                    )
                })?;
            }
        }

        let metadata = PlotMetadata {
            id,
            timestamp: timestamp.unwrap_or_else(now_ms),
            width,
            height,
            filename,
            code,
            snapshot_filename,
        };

        self.plots.push_back(metadata.clone());
        self.active = Some(self.plots.len().saturating_sub(1));

        if self.plots.len() > self.max_plots {
            if let Some(evicted) = self.plots.pop_front() {
                self.remove_file(&evicted);
            }
            // Adjust active index after eviction
            self.active = Some(self.plots.len().saturating_sub(1));
        }

        self.save_state()?;
        Ok(metadata)
    }

    /// Update the active plot by ID.
    pub fn set_active_plot(&mut self, plot_id: &str) -> Result<Option<PlotMetadata>> {
        if let Some((idx, _)) = self
            .plots
            .iter()
            .enumerate()
            .find(|(_, plot)| plot.id == plot_id)
        {
            self.active = Some(idx);
            self.save_state()?;
            return Ok(self.plots.get(idx).cloned());
        }
        Ok(None)
    }

    /// Export a plot to a caller-provided path.
    pub fn export_plot<P: AsRef<Path>>(&self, plot_id: &str, target: P) -> Result<()> {
        self.export_plot_with_format(plot_id, &target, ExportFormat::from_path(target.as_ref()))
    }

    /// Export a plot with a format override.
    pub fn export_plot_with_format<P: AsRef<Path>>(
        &self,
        plot_id: &str,
        target: P,
        format: ExportFormat,
    ) -> Result<()> {
        let plot = self
            .plots
            .iter()
            .find(|plot| plot.id == plot_id)
            .ok_or_else(|| anyhow::anyhow!("Plot {} not found", plot_id))?;

        let source = self.storage_path.join(&plot.filename);
        match format {
            ExportFormat::Png => {
                fs::copy(&source, &target).with_context(|| {
                    format!(
                        "Failed to export plot {} to {}",
                        plot_id,
                        target.as_ref().display()
                    )
                })?;
            }
            ExportFormat::Pdf => {
                self.export_pdf(&source, target.as_ref()).with_context(|| {
                    format!(
                        "Failed to export plot {} to {}",
                        plot_id,
                        target.as_ref().display()
                    )
                })?;
            }
        }

        Ok(())
    }

    /// Remove a plot from history and disk.
    pub fn delete_plot(&mut self, plot_id: &str) -> Result<Option<PlotHistorySnapshot>> {
        if let Some(pos) = self.plots.iter().position(|p| p.id == plot_id) {
            let removed = self
                .plots
                .remove(pos)
                .ok_or_else(|| anyhow!("Plot not found for id {}", plot_id))?;
            self.remove_file(&removed);

            if let Some(active_idx) = self.active {
                if pos < active_idx && active_idx > 0 {
                    self.active = Some(active_idx - 1);
                } else if pos == active_idx {
                    self.active = self
                        .plots
                        .is_empty()
                        .not()
                        .then_some(pos.min(self.plots.len().saturating_sub(1)));
                }
            }

            self.save_state()?;
            return self.snapshot().map(Some);
        }
        Ok(None)
    }

    /// Clear all plots and metadata.
    pub fn clear_all(&mut self) -> Result<PlotHistorySnapshot> {
        for plot in self.plots.iter() {
            self.remove_file(plot);
        }
        self.plots.clear();
        self.active = None;
        self.save_state()?;
        self.snapshot()
    }

    /// Produce a UI-friendly snapshot containing base64-encoded images.
    pub fn snapshot(&self) -> Result<PlotHistorySnapshot> {
        let plots = self
            .plots
            .iter()
            .map(|plot| self.load_entry(plot))
            .collect::<Result<Vec<_>>>()?;

        Ok(PlotHistorySnapshot {
            active_plot_id: self.active_plot_id(),
            plots,
        })
    }

    pub fn restore_state(&mut self) -> Result<()> {
        let metadata_path = self.metadata_path();
        if !metadata_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&metadata_path)
            .with_context(|| format!("Failed to read {}", metadata_path.display()))?;
        let state: PlotHistoryState =
            serde_json::from_str(&content).context("Failed to parse plots.json")?;

        let mut restored = VecDeque::new();
        let mut active: Option<usize> = None;

        for plot in state.plots {
            let path = self.storage_path.join(&plot.filename);
            if path.exists() {
                if active.is_none() && state.active_plot.as_deref() == Some(&plot.id) {
                    active = Some(restored.len());
                }
                restored.push_back(plot);
            }
        }

        self.plots = restored;
        self.active = active;
        Ok(())
    }

    pub fn save_state(&self) -> Result<()> {
        let state = PlotHistoryState {
            active_plot: self.active_plot_id(),
            plots: self.plots(),
        };
        let metadata_path = self.metadata_path();
        if let Some(parent) = metadata_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create metadata directory {}", parent.display())
            })?;
        }
        let content =
            serde_json::to_string_pretty(&state).context("Failed to serialize plot history")?;
        fs::write(&metadata_path, content)
            .with_context(|| format!("Failed to write {}", metadata_path.display()))?;
        Ok(())
    }

    fn remove_file(&self, plot: &PlotMetadata) {
        let path = self.storage_path.join(&plot.filename);
        let _ = fs::remove_file(path);
        if let Some(snapshot) = &plot.snapshot_filename {
            let snapshot_path = self.storage_path.join(snapshot);
            let _ = fs::remove_file(snapshot_path);
        }
    }

    fn load_entry(&self, plot: &PlotMetadata) -> Result<PlotHistoryEntry> {
        let path = self.storage_path.join(&plot.filename);
        let data = fs::read(&path).with_context(|| {
            format!(
                "Failed to load plot image {} from {}",
                plot.id,
                path.display()
            )
        })?;
        let base64 = BASE64_STANDARD.encode(&data);

        Ok(PlotHistoryEntry {
            id: plot.id.clone(),
            timestamp: plot.timestamp,
            width: plot.width,
            height: plot.height,
            filename: plot.filename.clone(),
            storage_path: format!("{}/{}", PLOT_HISTORY_SUBDIR, plot.filename),
            data: base64,
            code: plot.code.clone(),
            snapshot_path: plot.snapshot_filename.as_ref().and_then(|name| {
                let snapshot_path = self.storage_path.join(name);
                snapshot_path
                    .exists()
                    .then(|| format!("{}/{}", PLOT_HISTORY_SUBDIR, name))
            }),
        })
    }

    fn export_pdf(&self, png_path: &Path, target: &Path) -> Result<()> {
        let reader = ImageReader::open(png_path)
            .with_context(|| format!("Failed to open plot image {}", png_path.to_string_lossy()))?;
        let image = reader.decode().context("Failed to decode plot image")?;
        write_pdf_from_image(&image, target)
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Clone, Copy)]
pub enum ExportFormat {
    Png,
    Pdf,
}

impl ExportFormat {
    pub fn from_path(path: &Path) -> Self {
        match path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_ascii_lowercase())
            .as_deref()
        {
            Some("pdf") => ExportFormat::Pdf,
            _ => ExportFormat::Png,
        }
    }

    pub fn resolve(requested: Option<&str>, path: &Path) -> Self {
        requested
            .and_then(|value| value.parse::<ExportFormat>().ok())
            .unwrap_or_else(|| ExportFormat::from_path(path))
    }
}

impl FromStr for ExportFormat {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self> {
        let format = match value.to_ascii_lowercase().as_str() {
            "pdf" => ExportFormat::Pdf,
            _ => ExportFormat::Png,
        };
        Ok(format)
    }
}

fn write_pdf_from_image(image: &DynamicImage, target: &Path) -> Result<()> {
    use printpdf::{Image, ImageTransform, Mm, PdfDocument};

    let (px_w, px_h) = image.dimensions();
    let (px_w, px_h) = (px_w.max(1), px_h.max(1));
    let dpi: f64 = 96.0;
    let width_mm = (px_w as f64 / dpi) * 25.4;
    let height_mm = (px_h as f64 / dpi) * 25.4;

    let (doc, page1, layer1) = PdfDocument::new(
        "Re-prod Plot",
        Mm(width_mm as f32),
        Mm(height_mm as f32),
        "Layer 1",
    );
    let current_layer = doc.get_page(page1).get_layer(layer1);

    let pdf_image = Image::from_dynamic_image(image);
    pdf_image.add_to_layer(
        current_layer,
        ImageTransform {
            translate_x: None,
            translate_y: None,
            rotate: None,
            scale_x: Some(width_mm as f32),
            scale_y: Some(height_mm as f32),
            dpi: Some(dpi as f32),
        },
    );

    let file =
        File::create(target).with_context(|| format!("Failed to create {}", target.display()))?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .with_context(|| format!("Failed to write PDF to {}", target.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn png_bytes() -> Vec<u8> {
        // Minimal valid PNG header for testing.
        vec![
            0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 0, 0, 0, 0, 0,
        ]
    }

    #[test]
    fn adds_and_persists_plots() {
        let dir = tempdir().expect("tmp dir");
        let path = dir.path().join("plots");

        let mut manager = PlotHistoryManager::new(path.clone()).expect("manager");
        let first = manager
            .add_plot(
                Some("first".into()),
                DEFAULT_PLOT_WIDTH,
                DEFAULT_PLOT_HEIGHT,
                &png_bytes(),
                None,
                None,
                Some(1),
            )
            .expect("add plot");

        assert_eq!(manager.plots.len(), 1);
        assert_eq!(manager.active_plot_id(), Some(first.id.clone()));

        // Recreate to ensure state is restored
        let restored = PlotHistoryManager::new(path).expect("restore");
        assert_eq!(restored.plots.len(), 1);
        assert_eq!(restored.active_plot_id(), Some(first.id));
    }

    #[test]
    fn evicts_oldest_when_capacity_exceeded() {
        let dir = tempdir().expect("tmp dir");
        let path = dir.path().join("plots");

        let mut manager = PlotHistoryManager::with_max(path, 2).expect("manager");
        manager
            .add_plot(
                Some("p1".into()),
                DEFAULT_PLOT_WIDTH,
                DEFAULT_PLOT_HEIGHT,
                &png_bytes(),
                None,
                None,
                Some(1),
            )
            .expect("p1");
        manager
            .add_plot(
                Some("p2".into()),
                DEFAULT_PLOT_WIDTH,
                DEFAULT_PLOT_HEIGHT,
                &png_bytes(),
                None,
                None,
                Some(2),
            )
            .expect("p2");
        manager
            .add_plot(
                Some("p3".into()),
                DEFAULT_PLOT_WIDTH,
                DEFAULT_PLOT_HEIGHT,
                &png_bytes(),
                None,
                None,
                Some(3),
            )
            .expect("p3");

        let ids: Vec<String> = manager.plots().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["p2".to_string(), "p3".to_string()]);
        assert_eq!(manager.active_plot_id().as_deref(), Some("p3"));
    }

    #[test]
    fn snapshot_includes_base64_data() {
        let dir = tempdir().expect("tmp dir");
        let path = dir.path().join("plots");

        let mut manager = PlotHistoryManager::new(path).expect("manager");
        manager
            .add_plot(
                Some("p1".into()),
                DEFAULT_PLOT_WIDTH,
                DEFAULT_PLOT_HEIGHT,
                &png_bytes(),
                None,
                Some("plot(x)".into()),
                Some(10),
            )
            .expect("p1");

        let snapshot = manager.snapshot().expect("snapshot");
        assert_eq!(snapshot.plots.len(), 1);
        let entry = &snapshot.plots[0];
        assert_eq!(entry.id, "p1");
        assert!(!entry.data.is_empty());
        assert_eq!(entry.code.as_deref(), Some("plot(x)"));
        assert_eq!(snapshot.active_plot_id.as_deref(), Some("p1"));
    }
}
