import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSwitchModal } from "../ProjectSwitchModal";

const requestMock = vi.fn();
const sendMock = vi.fn();
const sendAndWaitMock = vi.fn();

vi.mock("@/constants/features", () => ({
	IS_TAURI: false,
	isTauri: () => false,
}));

vi.mock("@/services/socket", () => ({
	socketService: {
		request: (...args: any[]) => requestMock(...args),
		send: (...args: any[]) => sendMock(...args),
		sendAndWait: (...args: any[]) => sendAndWaitMock(...args),
	},
}));

describe("ProjectSwitchModal", () => {
	beforeEach(() => {
		requestMock.mockReset();
		sendMock.mockReset();
		sendAndWaitMock.mockReset();
	});

	it("loads and renders project list", async () => {
		requestMock.mockResolvedValueOnce({
			type: "project_list_result",
			projects: [
				{ id: "1", name: "Alpha", path: "/srv/alpha", created_at: 1 },
				{ id: "2", name: "Beta", path: "/srv/beta", created_at: 2 },
			],
		});

		render(<ProjectSwitchModal open onClose={vi.fn()} />);

		await waitFor(() => {
			expect(screen.getByText("Alpha")).toBeTruthy();
		});
		expect(screen.getByText("Beta")).toBeTruthy();
	});

	it("creates a project and adds it to the list", async () => {
		requestMock.mockResolvedValueOnce({
			type: "project_list_result",
			projects: [],
		});
		sendAndWaitMock.mockResolvedValueOnce({
			type: "project_created",
			project: { id: "3", name: "New Project", path: "/srv/new", created_at: 3 },
		});

		render(<ProjectSwitchModal open onClose={vi.fn()} />);

		await waitFor(() => {
			expect(screen.getByText("No projects found.")).toBeTruthy();
		});

		const input = screen.getByLabelText("Create new project");
		await userEvent.type(input, "New Project");
		await userEvent.click(screen.getByRole("button", { name: "Create" }));

		await waitFor(() => {
			expect(screen.getByText("New Project")).toBeTruthy();
		});
	});
});
