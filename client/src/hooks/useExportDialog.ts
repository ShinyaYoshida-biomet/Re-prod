import { useCallback, useEffect, useReducer } from "react";
import type { ExportRMarkdownRequestPayload } from "shared";
import { ExportServiceError, exportRMarkdown } from "@/services/exportService";
import type {
	ExportDialogAction,
	ExportDialogOptions,
	ExportDialogState,
	ExportFormat,
	ExportOptionKey,
} from "@/types/exportDialog";
import { exportDialogInitialState } from "@/types/exportDialog";

function reducer(state: ExportDialogState, action: ExportDialogAction): ExportDialogState {
	switch (action.type) {
		case "set-format":
			return { ...state, format: action.payload };
		case "set-mode":
			return { ...state, mode: action.payload };
		case "set-option":
			return {
				...state,
				options: { ...state.options, [action.key]: action.value },
			};
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

interface UseExportDialogReturn {
	format: ExportFormat;
	setFormat: (next: ExportFormat) => void;
	mode: ExportRMarkdownRequestPayload["mode"];
	setMode: (next: ExportRMarkdownRequestPayload["mode"]) => void;
	options: ExportDialogOptions;
	setOption: (key: ExportOptionKey, value: boolean) => void;
	documentPath: string;
	setDocumentPath: (value: string) => void;
	outputPath: string;
	setOutputPath: (value: string) => void;
	exporting: boolean;
	error: string;
	handleExport: () => Promise<void>;
}

interface UseExportDialogProps {
	open: boolean;
	onClose: () => void;
}

export function useExportDialog({ open, onClose }: UseExportDialogProps): UseExportDialogReturn {
	const [state, dispatch] = useReducer(reducer, exportDialogInitialState);
	const { format, mode, options, documentPath, outputPath, exporting, error } = state;

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

	const handleExport = useCallback(async (): Promise<void> => {
		dispatch({ type: "set-exporting", payload: true });
		dispatch({ type: "set-error", payload: "" });

		if (format === "bundle") {
			dispatch({
				type: "set-error",
				payload: "Bundle export is not supported yet.",
			});
			dispatch({ type: "set-exporting", payload: false });
			return;
		}

		const trimmedDocumentPath = documentPath.trim();

		if (mode === "document" && !trimmedDocumentPath) {
			dispatch({
				type: "set-error",
				payload: "Document path is required for document-based export",
			});
			dispatch({ type: "set-exporting", payload: false });
			return;
		}

		const payload: ExportRMarkdownRequestPayload = {
			mode,
			outputPath,
			documentPath: mode === "document" ? trimmedDocumentPath : undefined,
			includeTimestamps: options.includeTimestamps,
			showActor: options.showActor,
			embedPlots: options.embedPlots,
			includeOutputs: options.includeOutputs,
			includeErrors: options.includeErrors,
			includeSummary: options.includeSummary,
		};

		try {
			await exportRMarkdown(payload);
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
	}, [format, mode, options, documentPath, outputPath, onClose]);

	return {
		format,
		setFormat: (next) => dispatch({ type: "set-format", payload: next }),
		mode,
		setMode: (next) => dispatch({ type: "set-mode", payload: next }),
		options,
		setOption,
		documentPath,
		setDocumentPath: (value) => dispatch({ type: "set-document-path", payload: value }),
		outputPath,
		setOutputPath: (value) => dispatch({ type: "set-output-path", payload: value }),
		exporting,
		error,
		handleExport,
	};
}
