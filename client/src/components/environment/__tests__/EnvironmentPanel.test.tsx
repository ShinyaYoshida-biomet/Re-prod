import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EnvironmentPanel } from "../EnvironmentPanel";
import type { EnvironmentVariable } from "@/types/generated";

const mockUseEnvironmentPanelState = vi.fn();

vi.mock("@/hooks/useEnvironmentPanelState", () => ({
	useEnvironmentPanelState: () => mockUseEnvironmentPanelState(),
}));

describe("EnvironmentPanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should display loading state", () => {
		mockUseEnvironmentPanelState.mockReturnValue({
			variables: [],
			isLoading: true,
			refresh: vi.fn(),
		});

		render(<EnvironmentPanel />);

		expect(screen.getByText("Loading environment...")).toBeInTheDocument();
	});

	it("should display empty state when no variables exist", () => {
		mockUseEnvironmentPanelState.mockReturnValue({
			variables: [],
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<EnvironmentPanel />);

		expect(screen.getByText("No variables in the environment.")).toBeInTheDocument();
		expect(screen.getByText("Run R code to create variables.")).toBeInTheDocument();
	});

	it("should display variables table when variables exist", () => {
		const mockVariables: EnvironmentVariable[] = [
			{ name: "x", type: "numeric", size: "length 10", value: "1, 2, 3, 4, 5, ..." },
			{ name: "y", type: "character", size: "length 3", value: "a, b, c" },
			{ name: "df", type: "data.frame", size: "5 obs. of 3 variables", value: "<data.frame>" },
		];

		mockUseEnvironmentPanelState.mockReturnValue({
			variables: mockVariables,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<EnvironmentPanel />);

		// Check table headers
		expect(screen.getByText("Name")).toBeInTheDocument();
		expect(screen.getByText("Type")).toBeInTheDocument();
		expect(screen.getByText("Size")).toBeInTheDocument();
		expect(screen.getByText("Value")).toBeInTheDocument();

		// Check variable data
		expect(screen.getByText("x")).toBeInTheDocument();
		expect(screen.getByText("numeric")).toBeInTheDocument();
		expect(screen.getByText("length 10")).toBeInTheDocument();
		expect(screen.getByText("1, 2, 3, 4, 5, ...")).toBeInTheDocument();

		expect(screen.getByText("y")).toBeInTheDocument();
		expect(screen.getByText("character")).toBeInTheDocument();
		expect(screen.getByText("length 3")).toBeInTheDocument();
		expect(screen.getByText("a, b, c")).toBeInTheDocument();

		expect(screen.getByText("df")).toBeInTheDocument();
		expect(screen.getByText("data.frame")).toBeInTheDocument();
		expect(screen.getByText("5 obs. of 3 variables")).toBeInTheDocument();
		expect(screen.getByText("<data.frame>")).toBeInTheDocument();
	});

	it("should display multiple variables in correct order", () => {
		const mockVariables: EnvironmentVariable[] = [
			{ name: "var1", type: "numeric", size: "length 1", value: "42" },
			{ name: "var2", type: "character", size: "length 1", value: "hello" },
			{ name: "var3", type: "logical", size: "length 1", value: "TRUE" },
		];

		mockUseEnvironmentPanelState.mockReturnValue({
			variables: mockVariables,
			isLoading: false,
			refresh: vi.fn(),
		});

		const { container } = render(<EnvironmentPanel />);

		const rows = container.querySelectorAll(".environment-row");
		expect(rows).toHaveLength(3);
	});

	it("should handle variables with long values", () => {
		const longValue = "a".repeat(100);
		const mockVariables: EnvironmentVariable[] = [
			{ name: "longVar", type: "character", size: "length 1", value: longValue },
		];

		mockUseEnvironmentPanelState.mockReturnValue({
			variables: mockVariables,
			isLoading: false,
			refresh: vi.fn(),
		});

		render(<EnvironmentPanel />);

		expect(screen.getByText(longValue)).toBeInTheDocument();
	});
});
