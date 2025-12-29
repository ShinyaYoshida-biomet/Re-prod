import { useCallback, useEffect, useReducer } from "react";
import { exportRMarkdown, ExportServiceError } from "@/services/exportService";
import { adjustOutputPathForFormat, exportDialogInitialState } from "@/types/exportDialog";
import type {
	ExportDialogAction,
	ExportDialogOptions,
	ExportDialogState,
	ExportDialogFormat,
	ExportOptionKey,
	ExportPdfOptionKey,
	ExportPdfOptions,
} from "@/types/exportDialog";
import type { CodeFolding, ExportRMarkdownRequestPayload } from "@/types";

function reducer(state: ExportDialogState, action: ExportDialogAction): ExportDialogState {
	switch (action.type) {
		case "set-format":
			return {
				...state,
				format: action.payload,
				outputPath: adjustOutputPathForFormat(state.outputPath, action.payload),
			};
		case "set-mode":
			return { ...state, mode: action.payload };
		case "set-option":
			return {
				...state,
				options: { ...state.options, [action.key]: action.value },
			};
		case "set-pdf-option":
			return {
				...state,
				pdfOptions: { ...state.pdfOptions, [action.key]: action.value },
			};
		case "set-code-folding":
			return { ...state, codeFolding: action.payload };
		case "set-document-path":
			return { ...state, documentPath: action.payload };
		case "set-output-path":
			return { ...state, outputPath: action.payload };
		case "set-exporting":
			return { ...state, exporting: action.payload };
		case "set-error":
			return { ...state, error: action.payload };
		case "reset":
			return { ...exportDialogInitialState };
		default:
			return state;
	}
}

interface UseExportDialogState {
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

interface UseExportDialogActions {
	setFormat: (next: ExportDialogFormat) => void;
	setMode: (next: ExportRMarkdownRequestPayload["mode"]) => void;
	setOption: (key: ExportOptionKey, value: boolean) => void;
	setCodeFolding: (next: CodeFolding) => void;
	setPdfOption: <TKey extends ExportPdfOptionKey>(key: TKey, value: ExportPdfOptions[TKey]) => void;
	setDocumentPath: (value: string) => void;
	setOutputPath: (value: string) => void;
	handleExport: () => Promise<void>;
}

interface UseExportDialogReturn {
	state: UseExportDialogState;
	actions: UseExportDialogActions;
}

interface UseExportDialogProps {
	open: boolean;
	onClose: () => void;
}

export function useExportDialog({ open, onClose }: UseExportDialogProps): UseExportDialogReturn {
	const [state, dispatch] = useReducer(reducer, exportDialogInitialState);
	const {
		format,
		mode,
		options,
		codeFolding,
		pdfOptions,
		documentPath,
		outputPath,
		exporting,
		error,
	} = state;

	useEffect(() => {
		if (!open) {
			dispatch({ type: "reset" });
		}
	}, [open]);

	useEffect(() => {
		if (!open || exporting || typeof document === "undefined") {
			return undefined;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !exporting) {
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open, exporting, onClose]);

	const setOption = useCallback((key: ExportOptionKey, value: boolean) => {
		dispatch({ type: "set-option", key, value });
	}, []);

	const setPdfOption = useCallback(
		<TKey extends ExportPdfOptionKey>(key: TKey, value: ExportPdfOptions[TKey]) => {
			dispatch({ type: "set-pdf-option", key, value });
		},
		[],
	);

	const handleExport = useCallback(async (): Promise<void> => {
		dispatch({ type: "set-exporting", payload: true });
		dispatch({ type: "set-error", payload: "" });

		const trimmedDocumentPath = documentPath.trim();

		if (mode === "document" && !trimmedDocumentPath) {
			dispatch({
				type: "set-error",
				payload: "Document path is required for document-based export",
			});
			dispatch({ type: "set-exporting", payload: false });
			return;
		}

		const basePayload = {
			mode,
			outputPath,
			documentPath: mode === "document" ? trimmedDocumentPath : undefined,
			codeFolding,
			includeTimestamps: options.includeTimestamps,
			showActor: options.showActor,
			embedPlots: options.embedPlots,
			includeOutputs: options.includeOutputs,
			includeErrors: options.includeErrors,
			includeSummary: options.includeSummary,
			outputTruncation: {
				headLines: 20,
				tailLines: 8,
				maxLines: 200,
			},
		};

		const pdfPayload = {
			...basePayload,
			format: "pdf" as const,
			pdfOptions: {
				toc: pdfOptions.toc,
				includeSource: pdfOptions.includeSource,
				highlightTheme: pdfOptions.highlightTheme,
				figWidth: pdfOptions.figWidth,
				figHeight: pdfOptions.figHeight,
				latexPreamble: pdfOptions.latexPreamble || undefined,
			},
		};

		const rmdPayload = {
			...basePayload,
			format: "rmarkdown" as const,
		};

		try {
			if (format === "both") {
				// Export RMarkdown first
				await exportRMarkdown(rmdPayload);
				// Then export PDF
				await exportRMarkdown(pdfPayload);
			} else if (format === "pdf") {
				await exportRMarkdown(pdfPayload);
			} else {
				await exportRMarkdown(rmdPayload);
			}
			onClose();
		} catch (err) {
			if (err instanceof ExportServiceError || err instanceof Error) {
				dispatch({ type: "set-error", payload: err.message });
			} else {
				dispatch({ type: "set-error", payload: "Export failed" });
			}
		} finally {
			dispatch({ type: "set-exporting", payload: false });
		}
	}, [format, mode, options, codeFolding, pdfOptions, documentPath, outputPath, onClose]);

	return {
		state: {
			format,
			mode,
			options,
			codeFolding,
			pdfOptions,
			documentPath,
			outputPath,
			exporting,
			error,
		},
		actions: {
			setFormat: (next) => dispatch({ type: "set-format", payload: next }),
			setMode: (next) => dispatch({ type: "set-mode", payload: next }),
			setOption,
			setCodeFolding: (next) => dispatch({ type: "set-code-folding", payload: next }),
			setPdfOption,
			setDocumentPath: (value) => dispatch({ type: "set-document-path", payload: value }),
			setOutputPath: (value) => dispatch({ type: "set-output-path", payload: value }),
			handleExport,
		},
	};
}
