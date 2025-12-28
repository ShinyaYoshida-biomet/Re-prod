import { useExportDialog } from "@/hooks/useExportDialog";
import { LoadingSpinner } from "@/components/shared";
import { classNames } from "@/utils/classNames";

interface ExportDialogProps {
	open: boolean;
	onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps): JSX.Element | null {
	const {
		format,
		setFormat,
		mode,
		setMode,
		options,
		setOption,
		codeFolding,
		setCodeFolding,
		pdfOptions,
		setPdfOption,
		documentPath,
		setDocumentPath,
		outputPath,
		setOutputPath,
		exporting,
		error,
		handleExport,
	} = useExportDialog({ open, onClose });

	if (!open) return null;

	return (
		<div
			className="export-dialog-overlay"
			onClick={exporting ? undefined : onClose}
			tabIndex={-1}
			onKeyDown={(e) => {
				if (!exporting && e.key === "Escape") {
					onClose();
				}
			}}
		>
			<div
				className="export-dialog"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="export-dialog-title"
				aria-describedby="export-dialog-description"
			>
				<div className="export-dialog-header">
					<h2 id="export-dialog-title">Export Document</h2>
					<p id="export-dialog-description" className="export-dialog-subtitle">
						Generate RMarkdown or PDF from your analysis
					</p>
					<button
						className="btn btn-icon"
						onClick={onClose}
						disabled={exporting}
						aria-label="Close dialog"
					>
						×
					</button>
				</div>

				<div className={classNames("export-dialog-content", exporting && "loading")}>
					{exporting && (
						<div className="export-loading-overlay">
							<LoadingSpinner size="large" message="Exporting..." />
						</div>
					)}
					{/* TODO: Reproduction Bundle export will be available in File > Export > Reproduction Bundle */}
					<div className="export-section">
						<label className="export-label" id="format-label">
							Output Format
						</label>
						<div className="export-radio-group" role="radiogroup" aria-labelledby="format-label">
							<label className="export-radio">
								<input
									type="radio"
									name="format"
									value="rmarkdown"
									checked={format === "rmarkdown"}
									onChange={(e) => setFormat(e.target.value as typeof format)}
									disabled={exporting}
									aria-label="RMarkdown Document"
								/>
								<span>RMarkdown (.Rmd)</span>
							</label>
							<label className="export-radio">
								<input
									type="radio"
									name="format"
									value="pdf"
									checked={format === "pdf"}
									onChange={(e) => setFormat(e.target.value as typeof format)}
									disabled={exporting}
									aria-label="PDF Document"
								/>
								<span>PDF (.pdf)</span>
							</label>
							<label className="export-radio">
								<input
									type="radio"
									name="format"
									value="both"
									checked={format === "both"}
									onChange={(e) => setFormat(e.target.value as typeof format)}
									disabled={exporting}
									aria-label="Both formats"
								/>
								<span>Both (RMarkdown + PDF)</span>
							</label>
						</div>
					</div>

					{
						<>
							<div className="export-section">
								<label className="export-label" id="mode-label">
									Export Mode
								</label>
								<div className="export-radio-group" role="radiogroup" aria-labelledby="mode-label">
									<label className="export-radio">
										<input
											type="radio"
											name="mode"
											value="timeline"
											checked={mode === "timeline"}
											onChange={(e) => setMode(e.target.value as typeof mode)}
											disabled={exporting}
											aria-label="Timeline-Based mode"
										/>
										<div className="export-radio-content">
											<span className="export-radio-title">Timeline-Based (Actual Execution)</span>
											<span className="export-radio-description">
												Export what actually ran in console, including AI suggestions and
												exploration attempts
											</span>
										</div>
									</label>
									<label className="export-radio">
										<input
											type="radio"
											name="mode"
											value="document"
											checked={mode === "document"}
											onChange={(e) => setMode(e.target.value as typeof mode)}
											disabled={exporting}
											aria-label="Document-Based mode"
										/>
										<div className="export-radio-content">
											<span className="export-radio-title">Document-Based (Current File)</span>
											<span className="export-radio-description">
												Export the currently open .R file with cleaned, curated code
											</span>
										</div>
									</label>
								</div>
							</div>

							{mode === "document" && (
								<div className="export-section">
									<label className="export-label" htmlFor="documentPath">
										Document Path
									</label>
									<input
										type="text"
										id="documentPath"
										className="export-input"
										value={documentPath}
										onChange={(e) => setDocumentPath(e.target.value)}
										placeholder="analysis.R"
										disabled={exporting}
										aria-required="true"
										aria-describedby="documentPath-hint"
									/>
									<p id="documentPath-hint" className="export-hint">
										Path to the R file to export
									</p>
								</div>
							)}

							{(format === "pdf" || format === "both") && (
								<>
									<div className="export-section">
										<p className="export-hint">
											PDF export requires LaTeX (TinyTeX recommended). If you hit compilation
											errors, install TinyTeX inside R with <code>tinytex::install_tinytex()</code>.
										</p>
									</div>

									<div className="export-section">
										<label className="export-label" id="pdf-options-label">
											PDF Options
										</label>
										<div
											className="export-checkbox-group"
											role="group"
											aria-labelledby="pdf-options-label"
										>
											<label className="export-checkbox">
												<input
													type="checkbox"
													checked={pdfOptions.toc}
													onChange={(e) => setPdfOption("toc", e.target.checked)}
													disabled={exporting}
													aria-label="Include table of contents"
												/>
												<span>Include table of contents</span>
											</label>
											<label className="export-checkbox">
												<input
													type="checkbox"
													checked={pdfOptions.includeSource}
													onChange={(e) => setPdfOption("includeSource", e.target.checked)}
													disabled={exporting}
													aria-label="Include source code"
												/>
												<span>Include source code</span>
											</label>
											<label className="export-checkbox">
												<input
													type="checkbox"
													checked={options.embedPlots}
													onChange={(e) => setOption("embedPlots", e.target.checked)}
													disabled={exporting}
													aria-label="Embed plot images inline"
												/>
												<span>Embed plot images inline</span>
											</label>
										</div>
									</div>
								</>
							)}

							<div className="export-section">
								<label className="export-label" id="options-label">
									Options
								</label>
								<div className="export-field">
									<label className="export-field-label" htmlFor="codeFolding">
										Code Folding
									</label>
									<select
										id="codeFolding"
										className="export-input"
										value={codeFolding}
										onChange={(e) => setCodeFolding(e.target.value as typeof codeFolding)}
										disabled={exporting}
									>
										<option value="show">Show code by default</option>
										<option value="hide">Hide code by default</option>
									</select>
								</div>
								<div className="export-checkbox-group" role="group" aria-labelledby="options-label">
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={options.includeTimestamps}
											onChange={(e) => setOption("includeTimestamps", e.target.checked)}
											disabled={exporting}
											aria-label="Include timestamps in export"
										/>
										<span>Include timestamps</span>
									</label>
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={options.showActor}
											onChange={(e) => setOption("showActor", e.target.checked)}
											disabled={exporting}
											aria-label="Show actor for each chunk"
										/>
										<span>Show actor (User/AI) for each chunk</span>
									</label>
									{format !== "pdf" && (
										<label className="export-checkbox">
											<input
												type="checkbox"
												checked={options.embedPlots}
												onChange={(e) => setOption("embedPlots", e.target.checked)}
												disabled={exporting}
												aria-label="Embed plot images inline"
											/>
											<span>Embed plot images inline</span>
										</label>
									)}
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={options.includeOutputs}
											onChange={(e) => setOption("includeOutputs", e.target.checked)}
											disabled={exporting}
											aria-label="Include execution outputs"
										/>
										<span>Include execution outputs</span>
									</label>
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={options.includeErrors}
											onChange={(e) => setOption("includeErrors", e.target.checked)}
											disabled={exporting}
											aria-label="Include error messages"
										/>
										<span>Include error messages</span>
									</label>
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={options.includeSummary}
											onChange={(e) => setOption("includeSummary", e.target.checked)}
											disabled={exporting}
											aria-label="Add session statistics summary"
										/>
										<span>Add session statistics summary</span>
									</label>
								</div>
							</div>

							<div className="export-section">
								<label className="export-label" htmlFor="outputPath">
									Output Path
								</label>
								<input
									type="text"
									id="outputPath"
									className="export-input"
									value={outputPath}
									onChange={(e) => setOutputPath(e.target.value)}
									disabled={exporting}
									aria-required="true"
									aria-describedby="outputPath-hint"
								/>
								<p id="outputPath-hint" className="export-hint">
									File path where the {format === "pdf" ? "PDF file" : "RMarkdown"} will be saved
								</p>
							</div>
						</>
					}

					{error && (
						<div className="export-error" role="alert" aria-live="polite">
							<span>{error}</span>
						</div>
					)}
				</div>

				<div className="export-dialog-footer">
					<button className="btn" onClick={onClose} disabled={exporting}>
						Cancel
					</button>
					<button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
						{exporting ? "Exporting..." : "Export"}
					</button>
				</div>
			</div>
		</div>
	);
}
