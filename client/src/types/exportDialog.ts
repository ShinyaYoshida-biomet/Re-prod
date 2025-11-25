import type { ExportRMarkdownRequestPayload } from "shared";

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

export type ExportFormat = "bundle" | "rmarkdown" | "both";

export interface ExportDialogState {
	format: ExportFormat;
	mode: ExportRMarkdownRequestPayload["mode"];
	options: ExportDialogOptions;
	documentPath: string;
	outputPath: string;
	exporting: boolean;
	error: string;
}

export type ExportDialogAction =
	| { type: "set-format"; payload: ExportFormat }
	| { type: "set-mode"; payload: ExportRMarkdownRequestPayload["mode"] }
	| { type: "set-option"; key: ExportOptionKey; value: boolean }
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

export const exportDialogInitialState: ExportDialogState = {
	format: "rmarkdown",
	mode: "timeline",
	options: exportDialogDefaultOptions,
	documentPath: "",
	outputPath: "analysis_report.Rmd",
	exporting: false,
	error: "",
};
