use super::bundle::ReproductionBundle;
use super::scripts::{generate_readme, generate_replay_script, generate_validation_script};
use base64::prelude::*;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::fs::File;
use std::io::{self, Write};
use std::path::Path;

/// Error type for bundle writing operations.
#[derive(Debug)]
pub enum WriterError {
    Io(io::Error),
    Json(serde_json::Error),
    Validation(String),
}

impl From<io::Error> for WriterError {
    fn from(err: io::Error) -> Self {
        Self::Io(err)
    }
}

impl From<serde_json::Error> for WriterError {
    fn from(err: serde_json::Error) -> Self {
        Self::Json(err)
    }
}

impl std::fmt::Display for WriterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO error: {}", e),
            Self::Json(e) => write!(f, "JSON error: {}", e),
            Self::Validation(e) => write!(f, "Validation error: {}", e),
        }
    }
}

impl std::error::Error for WriterError {}

/// Writer for creating tar.gz reproduction bundles.
pub struct BundleWriter {
    bundle: ReproductionBundle,
}

impl BundleWriter {
    /// Create a new bundle writer.
    pub const fn new(bundle: ReproductionBundle) -> Self {
        Self { bundle }
    }

    /// Write the bundle as a tar.gz file.
    pub fn write_tarball<P: AsRef<Path>>(&self, output_path: P) -> Result<(), WriterError> {
        // Validate bundle before writing
        let validation = self.bundle.validate();
        if !validation.valid {
            return Err(WriterError::Validation(format!(
                "Bundle validation failed: {:?}",
                validation.errors
            )));
        }

        // Create tar.gz file
        let file = File::create(output_path.as_ref())?;
        let encoder = GzEncoder::new(file, Compression::default());
        let mut archive = tar::Builder::new(encoder);

        // Add metadata.json
        let metadata_json = serde_json::to_string_pretty(&self.bundle.metadata)?;
        self.add_file_to_archive(&mut archive, "metadata.json", metadata_json.as_bytes())?;

        // Add timeline.json
        let timeline = self.bundle.create_timeline_export();
        let timeline_json = serde_json::to_string_pretty(&timeline)?;
        self.add_file_to_archive(&mut archive, "timeline.json", timeline_json.as_bytes())?;

        // Add README.md
        let readme = generate_readme(&self.bundle);
        self.add_file_to_archive(&mut archive, "README.md", readme.as_bytes())?;

        // Add validation script
        let validation_script = generate_validation_script();
        self.add_file_to_archive(&mut archive, "validate.sh", validation_script.as_bytes())?;

        // Add replay script
        let replay_script = generate_replay_script();
        self.add_file_to_archive(&mut archive, "replay.R", replay_script.as_bytes())?;

        // Add code files
        let code_files = self.bundle.extract_code_files();
        for (doc_path, code_content) in code_files {
            let file_path = format!("code/{}", doc_path);
            self.add_file_to_archive(&mut archive, &file_path, code_content.as_bytes())?;
        }

        // Add plot files
        for event in &self.bundle.events {
            for (idx, plot) in event.result.plots.iter().enumerate() {
                let plot_path = format!("plots/{}_plot_{}.png", event.event_id, idx);

                // Decode base64 plot data
                if let Ok(plot_data) = BASE64_STANDARD.decode(&plot.base64_data) {
                    self.add_file_to_archive(&mut archive, &plot_path, &plot_data)?;
                }
            }
        }

        // Finalize archive
        archive.finish()?;

        Ok(())
    }

    /// Add a file to the tar archive.
    fn add_file_to_archive<W: Write>(
        &self,
        archive: &mut tar::Builder<W>,
        path: &str,
        data: &[u8],
    ) -> Result<(), WriterError> {
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();

        archive.append_data(&mut header, path, data)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{
        CodeBlockKind, CodeBlockMetadata, EnvironmentSnapshot, ExecutionActor, ExecutionContext,
        ExecutionResult, ExecutionSource, RunStatus,
    };

    fn create_test_bundle() -> ReproductionBundle {
        let event = crate::protocol::ExecutionEvent {
            event_id: "evt-test".to_string(),
            context: ExecutionContext {
                source: ExecutionSource::Cell,
                document_path: Some("test.R".to_string()),
                cell_index: Some(1),
                triggered_at_ms: 1699200000000,
                actor: ExecutionActor::User,
            },
            blocks: vec![CodeBlockMetadata {
                id: "block-1".to_string(),
                index: 0,
                kind: CodeBlockKind::Section,
                label: Some("Test".to_string()),
                start_line: 1,
                end_line: 2,
                code: "x <- 1:10".to_string(),
            }],
            result: ExecutionResult {
                success: true,
                output: "[1] 1 2 3".to_string(),
                error: None,
                plots: vec![],
                execution_time_ms: 42,
            },
            environment: EnvironmentSnapshot {
                r_version: None,
                r_path: "Rscript".to_string(),
                working_dir: "/tmp/test".to_string(),
                temp_dir: "/tmp/reprod".to_string(),
            },
            created_at_ms: 1699200001000,
            status: RunStatus::Succeeded,
            started_at_ms: 1699200000000,
            finished_at_ms: Some(1699200001000),
            duration_ms: Some(1000),
        };

        ReproductionBundle::from_events(vec![event])
    }

    #[test]
    fn test_writer_creation() {
        let bundle = create_test_bundle();
        let writer = BundleWriter::new(bundle);

        assert_eq!(writer.bundle.events.len(), 1);
    }

    #[test]
    fn test_write_tarball() {
        let bundle = create_test_bundle();
        let writer = BundleWriter::new(bundle);

        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test-bundle.tar.gz");

        let result = writer.write_tarball(&output_path);
        assert!(
            result.is_ok(),
            "Failed to write tarball: {:?}",
            result.err()
        );

        // Verify file was created
        assert!(output_path.exists());

        // Cleanup
        std::fs::remove_file(output_path).ok();
    }

    #[test]
    fn test_tarball_contains_required_files() {
        let bundle = create_test_bundle();
        let writer = BundleWriter::new(bundle);

        let temp_dir = std::env::temp_dir();
        let output_path = temp_dir.join("test-bundle-contents.tar.gz");

        writer.write_tarball(&output_path).unwrap();

        // Read and verify archive contents
        let file = File::open(&output_path).unwrap();
        let decoder = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(decoder);

        let mut found_files = std::collections::HashSet::new();
        for entry in archive.entries().unwrap() {
            let entry = entry.unwrap();
            let path = entry.path().unwrap();
            found_files.insert(path.to_string_lossy().to_string());
        }

        // Check for required files
        assert!(found_files.contains("metadata.json"));
        assert!(found_files.contains("timeline.json"));
        assert!(found_files.contains("README.md"));
        assert!(found_files.contains("validate.sh"));
        assert!(found_files.contains("replay.R"));

        // Cleanup
        std::fs::remove_file(output_path).ok();
    }
}
