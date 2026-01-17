import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ConsolePanel } from "../ConsolePanel";
import { useConsolePanelState } from "@/hooks/useConsolePanelState";

// Mock dependencies
vi.mock("@/hooks/useConsolePanelState", () => ({
	useConsolePanelState: vi.fn(),
}));

vi.mock("@/components/shared", () => ({
	IconBarChart: () => <div data-testid="icon-bar-chart" />,
	IconCheckCircle: () => <div data-testid="icon-check-circle" />,
	IconXCircle: () => <div data-testid="icon-x-circle" />,
}));

describe("ConsolePanel", () => {
	const mockExecution = {
		results: [],
		history: [],
		lastError: null,
	};

	const mockConsoleEndRef = { current: null };

	beforeEach(() => {
		vi.clearAllMocks();
		(useConsolePanelState as any).mockReturnValue({
			execution: mockExecution,
			consoleEndRef: mockConsoleEndRef,
		});
	});

	describe("Console View", () => {
		it("should render welcome message when empty", () => {
			render(<ConsolePanel view="console" />);
			expect(screen.getByText(/Console ready/)).toBeInTheDocument();
		});

		it("should render error banner", () => {
			(useConsolePanelState as any).mockReturnValue({
				execution: { ...mockExecution, lastError: "Something went wrong" },
				consoleEndRef: mockConsoleEndRef,
			});

			render(<ConsolePanel view="console" />);
			expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
		});

		it("should render execution results", () => {
			const results = [
				{
					timestamp: 1672531200000,
					pending: false,
					duration: 100,
					success: true,
					code: 'print("hello")',
					stdout: "[1] hello",
					stderr: "",
					plots: [],
				},
			];

			(useConsolePanelState as any).mockReturnValue({
				execution: { ...mockExecution, results },
				consoleEndRef: mockConsoleEndRef,
			});

			render(<ConsolePanel view="console" />);

			expect(screen.getByText('print("hello")')).toBeInTheDocument();
			expect(screen.getByText("[1] hello")).toBeInTheDocument();
			expect(screen.getByText("(100ms)")).toBeInTheDocument();
		});

		it("should render pending execution", () => {
			const results = [
				{
					timestamp: Date.now(),
					pending: true,
					duration: 0,
					success: false,
					code: "long_running_task()",
					stdout: "",
					stderr: "",
					plots: [],
				},
			];

			(useConsolePanelState as any).mockReturnValue({
				execution: { ...mockExecution, results },
				consoleEndRef: mockConsoleEndRef,
			});

			render(<ConsolePanel view="console" />);

			expect(screen.getByText("Pending")).toBeInTheDocument();
			expect(screen.getByText("Execution in progress…")).toBeInTheDocument();
		});

		it("should render error state", () => {
			const results = [
				{
					timestamp: Date.now(),
					pending: false,
					duration: 50,
					success: false,
					code: 'stop("error")',
					stdout: "",
					stderr: "Error: message",
					plots: [],
				},
			];

			(useConsolePanelState as any).mockReturnValue({
				execution: { ...mockExecution, results },
				consoleEndRef: mockConsoleEndRef,
			});

			render(<ConsolePanel view="console" />);

			expect(screen.getByText("Error")).toBeInTheDocument(); // Badge
			expect(screen.getByText("Error: message")).toBeInTheDocument();
		});

		it("should handle plot interactions", () => {
			const results = [
				{
					timestamp: Date.now(),
					pending: false,
					duration: 200,
					success: true,
					code: "plot(1:10)",
					stdout: "",
					stderr: "",
					plots: [{ id: "plot1" }],
				},
			];

			(useConsolePanelState as any).mockReturnValue({
				execution: { ...mockExecution, results },
				consoleEndRef: mockConsoleEndRef,
			});

			const dispatchSpy = vi.spyOn(window, "dispatchEvent");

			render(<ConsolePanel view="console" />);

			const plotInfo = screen.getByRole("button", { name: /Generated 1 plot/ });
			expect(plotInfo).toBeInTheDocument();
			expect(plotInfo).toHaveAttribute("title", "Click to view plot");

			fireEvent.click(plotInfo);

			expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
			const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
			expect(event.type).toBe("focusPlot");
			expect(event.detail).toEqual({ plotIndex: 0, plotId: "plot1" });
		});
	});

	describe("History View", () => {
		it("should render welcome message when history is empty", () => {
			render(<ConsolePanel view="history" />);
			expect(screen.getByText(/Execution history will appear here/)).toBeInTheDocument();
		});

		it("should render history items", () => {
			const history = [
				{
					timestamp: 1672531200000,
					success: true,
					plots: [],
					duration: 100,
				},
				{
					timestamp: 1672531201000,
					success: false,
					plots: [{ id: "p1" }],
					duration: 50,
				},
			];

			(useConsolePanelState as any).mockReturnValue({
				execution: { ...mockExecution, history },
				consoleEndRef: mockConsoleEndRef,
			});

			render(<ConsolePanel view="history" />);

			expect(screen.getByText("#1")).toBeInTheDocument();
			expect(screen.getByText("#2")).toBeInTheDocument();
			expect(screen.getByText(/100ms/)).toBeInTheDocument();
			expect(screen.getByText(/1 plot\(s\)/)).toBeInTheDocument();
			expect(screen.getAllByTestId("icon-check-circle")).toHaveLength(1);
			expect(screen.getAllByTestId("icon-x-circle")).toHaveLength(1);
		});
	});
});
