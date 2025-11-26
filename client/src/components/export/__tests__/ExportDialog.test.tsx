import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ExportDialog } from "../ExportDialog";
import { socketService } from "@/services/socket";

describe("ExportDialog", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("sends the nested request payload and closes when export succeeds", async () => {
		const sendMock = vi.fn((request, handler) => {
			handler({
				type: "export_rmarkdown_response",
				response: {
					success: true,
					outputPath: "analysis_report.Rmd",
				},
			});
			return true;
		});

		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

		expect(sendMock).toHaveBeenCalledTimes(1);
		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.type).toBe("export_rmarkdown");
		expect(sentRequest.request).toMatchObject({
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
		expect(sentRequest.request.pdfOptions).toBeUndefined();
		expect(sentRequest.request.documentPath).toBeUndefined();
	});

	it("shows an error message when the backend reports a failure and keeps the dialog open", async () => {
		const sendMock = vi.fn((request, handler) => {
			handler({
				type: "export_rmarkdown_response",
				response: {
					success: false,
					outputPath: "",
					error: "Export failed",
				},
			});
			return true;
		});

		vi.spyOn(socketService, "send").mockImplementation(sendMock);
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
		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.documentPath).toBe("/tmp/report.R");
	});

	it("sends PDF export requests with PDF options and updated output path", async () => {
		const sendMock = vi.fn((request, handler) => {
			handler({
				type: "export_rmarkdown_response",
				response: { success: true, outputPath: "analysis_report.pdf" },
			});
			return true;
		});

		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("radio", { name: /PDF Document/i }));
		const outputPathInput = screen.getByLabelText("Output Path") as HTMLInputElement;
		expect(outputPathInput.value).toBe("analysis_report.pdf");

		const includeSourceCheckbox = screen.getByLabelText("Include source code");
		fireEvent.click(includeSourceCheckbox); // disable source code

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.format).toBe("pdf");
		expect(sentRequest.request.outputPath).toBe("analysis_report.pdf");
		expect(sentRequest.request.pdfOptions).toMatchObject({
			toc: true,
			includeSource: false,
			highlightTheme: "tango",
			figWidth: 7,
			figHeight: 5,
		});
		expect(sentRequest.request.embedPlots).toBe(true);
	});

	it("toggles includeTimestamps option correctly", async () => {
		const sendMock = vi.fn((request, handler) => {
			handler({
				type: "export_rmarkdown_response",
				response: { success: true, outputPath: "test.Rmd" },
			});
			return true;
		});

		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		const timestampsCheckbox = screen.getByLabelText("Include timestamps");
		expect(timestampsCheckbox).toBeChecked();

		fireEvent.click(timestampsCheckbox);
		expect(timestampsCheckbox).not.toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.includeTimestamps).toBe(false);
	});

	it("requires document path for document mode", async () => {
		const sendMock = vi.fn();
		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("radio", { name: /Document-Based/i }));

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => {
			expect(
				screen.getByText("Document path is required for document-based export"),
			).toBeInTheDocument();
		});

		expect(sendMock).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("handles WebSocket connection failure", async () => {
		const sendMock = vi.fn(() => false);
		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => {
			expect(screen.getByText("WebSocket not connected")).toBeInTheDocument();
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("changes output path correctly", async () => {
		const sendMock = vi.fn((request, handler) => {
			handler({
				type: "export_rmarkdown_response",
				response: { success: true, outputPath: "custom_report.Rmd" },
			});
			return true;
		});

		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		const outputPathInput = screen.getByLabelText("Output Path");
		fireEvent.change(outputPathInput, { target: { value: "custom_report.Rmd" } });

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.outputPath).toBe("custom_report.Rmd");
	});
});
