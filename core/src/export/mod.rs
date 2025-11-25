//! Export module for creating reproduction bundles.
//!
//! This module provides functionality to export Re-prod sessions as
//! self-contained tar.gz bundles containing:
//! - Complete timeline of execution events
//! - Metadata and statistics
//! - Extracted code files
//! - Plot artifacts
//! - Validation and replay scripts
//! - RMarkdown documents for publication
//!
//! # Example
//!
//! ```no_run
//! use reprod_core::export::{ReproductionBundle, BundleWriter};
//! use reprod_core::protocol::ExecutionEvent;
//!
//! // Create bundle from events
//! let events: Vec<ExecutionEvent> = vec![]; // ... your events
//! let bundle = ReproductionBundle::from_events(events);
//!
//! // Validate bundle
//! let validation = bundle.validate();
//! assert!(validation.valid);
//!
//! // Write to tar.gz
//! let writer = BundleWriter::new(bundle);
//! writer.write_tarball("output.tar.gz").unwrap();
//! ```

pub mod bundle;
pub mod metadata;
pub mod rmarkdown;
pub mod scripts;
pub mod writer;

pub use bundle::{ReproductionBundle, TimelineExport, ValidationReport};
pub use metadata::{BundleFiles, BundleMetadata, EnvironmentInfo, SessionInfo, Statistics};
pub use rmarkdown::{
    render_pdf_document, CodeFolding, ExportFormat, ExportMode, PdfRenderOptions,
    RMarkdownGenerator, RMarkdownOptions,
};
pub use scripts::{generate_readme, generate_replay_script, generate_validation_script};
pub use writer::{BundleWriter, WriterError};
