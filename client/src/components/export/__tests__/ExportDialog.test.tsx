import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ExportDialog } from "../ExportDialog";

const { exportRMarkdownMock } = vi.hoisted(() => ({
	exportRMarkdownMock: vi.fn(),
}));

vi.mock("@/services/exportService", () => ({
	exportRMarkdown: exportRMarkdownMock,
	ExportServiceError: class ExportServiceError extends Error {},
}));

describe("ExportDialog", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		exportRMarkdownMock.mockReset();
	});

	it("sends the nested request payload and closes when export succeeds", async () => {
		exportRMarkdownMock.mockResolvedValueOnce({
			success: true,
			outputPath: "analysis_report.Rmd",
		});
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

		expect(exportRMarkdownMock).toHaveBeenCalledTimes(1);
		const [sentRequest] = exportRMarkdownMock.mock.calls[0];
		expect(sentRequest).toMatchObject({
			mode: "timeline",
			format: "rmarkdown",
			outputPath: "analysis_report.Rmd",
			codeFolding: "show",
			includeTimestamps: true,
			showActor: true,
			embedPlots: true,
			includeOutputs: true,
			includeErrors: false,
			includeSummary: true,
			outputTruncation: {
				headLines: 20,
				tailLines: 8,
				maxLines: 200,
			},
		});
		expect(sentRequest.pdfOptions).toBeUndefined();
		expect(sentRequest.documentPath).toBeUndefined();
	});

	it("shows an error message when the backend reports a failure and keeps the dialog open", async () => {
		exportRMarkdownMock.mockRejectedValueOnce(new Error("Export failed"));
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("radio", { name: /Document-Based/i }));
		const documentPathInput = screen.getByLabelText("Document Path");
		fireEvent.change(documentPathInput, { target: { value: "/tmp/report.R" } });

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => {
			expect(screen.getByText("Export failed")).toBeInTheDocument();
		});

		expect(onClose).not.toHaveBeenCalled();
		const [sentRequest] = exportRMarkdownMock.mock.calls[0];
		expect(sentRequest.documentPath).toBe("/tmp/report.R");
	});

	it("sends PDF export requests with PDF options and updated output path", async () => {
		exportRMarkdownMock.mockResolvedValueOnce({ success: true, outputPath: "analysis_report.pdf" });
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("radio", { name: /PDF Document/i }));
		const outputPathInput = screen.getByLabelText("Output Path") as HTMLInputElement;
		expect(outputPathInput.value).toBe("analysis_report.pdf");

		const includeSourceCheckbox = screen.getByLabelText("Include source code");
		fireEvent.click(includeSourceCheckbox); // disable source code

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = exportRMarkdownMock.mock.calls[0];
		expect(sentRequest.format).toBe("pdf");
		expect(sentRequest.outputPath).toBe("analysis_report.pdf");
		expect(sentRequest.pdfOptions).toMatchObject({
			toc: true,
			includeSource: false,
			highlightTheme: "tango",
			figWidth: 7,
			figHeight: 5,
		});
		expect(sentRequest.embedPlots).toBe(true);
	});

	it("toggles includeTimestamps option correctly", async () => {
		exportRMarkdownMock.mockResolvedValueOnce({ success: true, outputPath: "test.Rmd" });
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		const timestampsCheckbox = screen.getByLabelText("Include timestamps");
		expect(timestampsCheckbox).toBeChecked();

		fireEvent.click(timestampsCheckbox);
		expect(timestampsCheckbox).not.toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = exportRMarkdownMock.mock.calls[0];
		expect(sentRequest.includeTimestamps).toBe(false);
	});

	it("requires document path for document mode", async () => {
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("radio", { name: /Document-Based/i }));

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => {
			expect(
				screen.getByText("Document path is required for document-based export"),
			).toBeInTheDocument();
		});

		expect(exportRMarkdownMock).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("handles WebSocket connection failure", async () => {
		exportRMarkdownMock.mockRejectedValueOnce(new Error("WebSocket is not connected"));
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => {
			expect(screen.getByText("WebSocket is not connected")).toBeInTheDocument();
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("changes output path correctly", async () => {
		exportRMarkdownMock.mockResolvedValueOnce({ success: true, outputPath: "custom_report.Rmd" });
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		const outputPathInput = screen.getByLabelText("Output Path");
		fireEvent.change(outputPathInput, { target: { value: "custom_report.Rmd" } });

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = exportRMarkdownMock.mock.calls[0];
		expect(sentRequest.outputPath).toBe("custom_report.Rmd");
	});
});
