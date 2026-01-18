import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { PromptDialog } from "../PromptDialog";

describe("PromptDialog", () => {
	it("renders with title, message, and default value", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();
		const defaultValue = "default.txt";

		render(
			<PromptDialog
				open={true}
				title="Rename File"
				message="Enter new filename:"
				defaultValue={defaultValue}
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		expect(screen.getByText("Rename File")).toBeInTheDocument();
		expect(screen.getByText("Enter new filename:")).toBeInTheDocument();
		const input = screen.getByDisplayValue(defaultValue);
		expect(input).toBeInTheDocument();
	});

	it("updates value when typing", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(<PromptDialog open={true} title="Input" onConfirm={onConfirm} onCancel={onCancel} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "new-value" } });
		expect(input).toHaveValue("new-value");
	});

	it("calls onConfirm with input value when confirm button is clicked", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<PromptDialog
				open={true}
				title="Input"
				defaultValue="test"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "OK" }));
		expect(onConfirm).toHaveBeenCalledWith("test");
	});

	it("calls onConfirm when Enter key is pressed", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<PromptDialog
				open={true}
				title="Input"
				defaultValue="enter-test"
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const input = screen.getByRole("textbox");
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onConfirm).toHaveBeenCalledWith("enter-test");
	});

	it("calls onCancel when Cancel button is clicked", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(<PromptDialog open={true} title="Input" onConfirm={onConfirm} onCancel={onCancel} />);

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalled();
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("calls onCancel when Escape key is pressed", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(<PromptDialog open={true} title="Input" onConfirm={onConfirm} onCancel={onCancel} />);

		const input = screen.getByRole("textbox");
		fireEvent.keyDown(input, { key: "Escape" });
		expect(onCancel).toHaveBeenCalled();
	});

	it("disables confirm button when input is empty", () => {
		const onConfirm = vi.fn();
		const onCancel = vi.fn();

		render(
			<PromptDialog
				open={true}
				title="Input"
				defaultValue=""
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>,
		);

		const confirmBtn = screen.getByRole("button", { name: "OK" });
		expect(confirmBtn).toBeDisabled();

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "something" } });
		expect(confirmBtn).not.toBeDisabled();
	});
});
