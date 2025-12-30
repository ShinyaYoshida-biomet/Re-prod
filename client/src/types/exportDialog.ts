import type { CodeFolding, ExportRMarkdownRequestPayload, PdfExportOptions } from "./ws";

export type ExportDialogOptions = Pick<
	ExportRMarkdownRequestPayload,
	| "includeTimestamps"
	| "showActor"
	| "embedPlots"
	| "includeOutputs"
	| "includeErrors"
	| "includeSummary"
>;

export type ExportOptionKey = keyof ExportDialogOptions;

export type ExportPdfOptions = Required<
	Pick<PdfExportOptions, "toc" | "includeSource"> & {
		highlightTheme: string;
		figWidth: number;
		figHeight: number;
		latexPreamble: string;
	}
>;

export type ExportPdfOptionKey = keyof ExportPdfOptions;

// TODO: Reproduction Bundle export will be implemented as a separate feature
// Future: Add "bundle" format with dedicated UI in File > Export > Reproduction Bundle
export type ExportDialogFormat = "rmarkdown" | "pdf" | "both";

export interface ExportDialogState {
	format: ExportDialogFormat;
	mode: ExportRMarkdownRequestPayload["mode"];
	options: ExportDialogOptions;
	codeFolding: CodeFolding;
	pdfOptions: ExportPdfOptions;
	documentPath: string;
	outputPath: string;
	exporting: boolean;
	error: string;
}

export type ExportDialogAction =
	| { type: "set-format"; payload: ExportDialogFormat }
	| { type: "set-mode"; payload: ExportRMarkdownRequestPayload["mode"] }
	| { type: "set-option"; key: ExportOptionKey; value: boolean }
	| { type: "set-pdf-option"; key: ExportPdfOptionKey; value: ExportPdfOptions[ExportPdfOptionKey] }
	| { type: "set-code-folding"; payload: CodeFolding }
	| { type: "set-document-path"; payload: string }
	| { type: "set-output-path"; payload: string }
	| { type: "set-exporting"; payload: boolean }
	| { type: "set-error"; payload: string }
	| { type: "reset" };

export const exportDialogDefaultOptions: ExportDialogOptions = {
	includeTimestamps: true,
	showActor: true,
	embedPlots: true,
	includeOutputs: true,
	includeErrors: false,
	includeSummary: true,
};

export const exportDialogDefaultPdfOptions: ExportPdfOptions = {
	toc: true,
	includeSource: true,
	highlightTheme: "tango",
	figWidth: 7,
	figHeight: 5,
	latexPreamble: "",
};

export function adjustOutputPathForFormat(outputPath: string, format: ExportDialogFormat): string {
	const trimmed = outputPath.trim();
	if (format === "pdf" && trimmed.toLowerCase().endsWith(".rmd")) {
		return trimmed.replace(/\.rmd$/i, ".pdf");
	}
	if ((format === "rmarkdown" || format === "both") && trimmed.toLowerCase().endsWith(".pdf")) {
		return trimmed.replace(/\.pdf$/i, ".Rmd");
	}
	return trimmed;
}

export const exportDialogInitialState: ExportDialogState = {
	format: "rmarkdown",
	mode: "timeline",
	options: exportDialogDefaultOptions,
	codeFolding: "show",
	pdfOptions: exportDialogDefaultPdfOptions,
	documentPath: "",
	outputPath: "analysis_report.Rmd",
	exporting: false,
	error: "",
};
