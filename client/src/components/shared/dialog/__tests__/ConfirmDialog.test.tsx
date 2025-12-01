import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConfirmDialog } from "../ConfirmDialog";

describe("ConfirmDialog", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders with title and message props", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Delete File"
				message="Are you sure you want to delete this file?"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		expect(screen.getByText("Delete File")).toBeInTheDocument();
		expect(screen.getByText("Are you sure you want to delete this file?")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
	});

	it("renders with custom button labels", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Delete File"
				message="Are you sure?"
				confirmLabel="Delete"
				cancelLabel="Keep"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
	});

	it("calls onConfirm when confirm button is clicked", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Confirm Action"
				message="Please confirm"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const confirmButton = screen.getByRole("button", { name: "Confirm" });
		fireEvent.click(confirmButton);

		expect(onConfirm).toHaveBeenCalledTimes(1);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it("calls onCancel when cancel button is clicked", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Confirm Action"
				message="Please confirm"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		fireEvent.click(cancelButton);

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("calls onCancel when close button (×) is clicked", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Confirm Action"
				message="Please confirm"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const closeButton = screen.getByRole("button", { name: "Close dialog" });
		fireEvent.click(closeButton);

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("calls onCancel when backdrop overlay is clicked", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Confirm Action"
				message="Please confirm"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const overlay = screen.getByRole("presentation");
		fireEvent.click(overlay);

		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("does not call onCancel when clicking inside the dialog content", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Confirm Action"
				message="Please confirm"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		fireEvent.click(dialog);

		expect(onCancel).not.toHaveBeenCalled();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("does not render when open prop is false", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		const { container } = render(
			<ConfirmDialog
				open={false}
				title="Confirm Action"
				message="Please confirm"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		expect(container.firstChild).toBeNull();
	});

	it("has proper ARIA attributes for accessibility", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<ConfirmDialog
				open={true}
				title="Delete File"
				message="Are you sure?"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveAttribute("aria-modal", "true");
		expect(dialog).toHaveAttribute("aria-labelledby", "confirm-dialog-title");
		expect(dialog).toHaveAttribute("aria-describedby", "confirm-dialog-message");

		const title = screen.getByText("Delete File");
		expect(title).toHaveAttribute("id", "confirm-dialog-title");

		const message = screen.getByText("Are you sure?");
		expect(message).toHaveAttribute("id", "confirm-dialog-message");
	});
});
