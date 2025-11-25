import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { socketService } from "@/services/socket";
import { ExportDialog } from "../ExportDialog";

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
			outputPath: "analysis_report.Rmd",
			includeTimestamps: true,
			showActor: true,
			embedPlots: true,
			includeOutputs: true,
			includeErrors: false,
			includeSummary: true,
		});
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

	it("toggles showActor option correctly", async () => {
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

		const actorCheckbox = screen.getByLabelText("Show actor (User/AI) for each chunk");
		expect(actorCheckbox).toBeChecked();

		fireEvent.click(actorCheckbox);
		expect(actorCheckbox).not.toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.showActor).toBe(false);
	});

	it("toggles embedPlots option correctly", async () => {
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

		const plotsCheckbox = screen.getByLabelText("Embed plot images inline");
		expect(plotsCheckbox).toBeChecked();

		fireEvent.click(plotsCheckbox);
		expect(plotsCheckbox).not.toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.embedPlots).toBe(false);
	});

	it("toggles includeOutputs option correctly", async () => {
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

		const outputsCheckbox = screen.getByLabelText("Include execution outputs");
		expect(outputsCheckbox).toBeChecked();

		fireEvent.click(outputsCheckbox);
		expect(outputsCheckbox).not.toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.includeOutputs).toBe(false);
	});

	it("toggles includeErrors option correctly", async () => {
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

		const errorsCheckbox = screen.getByLabelText("Include error messages");
		expect(errorsCheckbox).not.toBeChecked();

		fireEvent.click(errorsCheckbox);
		expect(errorsCheckbox).toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.includeErrors).toBe(true);
	});

	it("toggles includeSummary option correctly", async () => {
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

		const summaryCheckbox = screen.getByLabelText("Add session statistics summary");
		expect(summaryCheckbox).toBeChecked();

		fireEvent.click(summaryCheckbox);
		expect(summaryCheckbox).not.toBeChecked();

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.includeSummary).toBe(false);
	});

	it("sends all options disabled when all checkboxes are unchecked", async () => {
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

		// Uncheck all options that are checked by default
		fireEvent.click(screen.getByLabelText("Include timestamps"));
		fireEvent.click(screen.getByLabelText("Show actor (User/AI) for each chunk"));
		fireEvent.click(screen.getByLabelText("Embed plot images inline"));
		fireEvent.click(screen.getByLabelText("Include execution outputs"));
		fireEvent.click(screen.getByLabelText("Add session statistics summary"));

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request).toMatchObject({
			includeTimestamps: false,
			showActor: false,
			embedPlots: false,
			includeOutputs: false,
			includeErrors: false,
			includeSummary: false,
		});
	});

	it("requires document path for document mode", async () => {
		const sendMock = vi.fn();
		vi.spyOn(socketService, "send").mockImplementation(sendMock);
		const onClose = vi.fn();

		render(<ExportDialog open onClose={onClose} />);

		// Switch to document mode
		fireEvent.click(screen.getByRole("radio", { name: /Document-Based/i }));

		// Try to export without document path
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
		fireEvent.change(outputPathInput, {
			target: { value: "custom_report.Rmd" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Export" }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		const [sentRequest] = sendMock.mock.calls[0];
		expect(sentRequest.request.outputPath).toBe("custom_report.Rmd");
	});
});
