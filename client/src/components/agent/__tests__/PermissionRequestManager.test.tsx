import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionRequestManager } from "../PermissionRequestManager";

const decidePermissionMock = vi.fn();
let permissionListener: ((payload: any) => void) | null = null;

const externalAgentClientMock = {
	onSessionUpdate: vi.fn(),
	onPermissionRequest: (cb: (payload: any) => void) => {
		permissionListener = cb;
		return () => {
			permissionListener = null;
		};
	},
	createSession: vi.fn(),
	prompt: vi.fn(),
	cancel: vi.fn(),
	decidePermission: (...args: any[]) => decidePermissionMock(...args),
};

vi.mock("@/services/externalAgentClient", () => ({
	getExternalAgentClient: () => externalAgentClientMock,
}));

describe("PermissionRequestManager", () => {
	beforeEach(() => {
		decidePermissionMock.mockReset();
		permissionListener = null;
		externalAgentClientMock.onSessionUpdate.mockReset();
		externalAgentClientMock.createSession.mockReset();
		externalAgentClientMock.prompt.mockReset();
		externalAgentClientMock.cancel.mockReset();
	});

	it("renders request with context, allow/deny/remember, and sends decision", async () => {
		const payload = {
			request_id: "req-1",
			session_id: "s1",
			tool_call_id: "t1",
			tool_title: "read file",
			locations: ["/workspace/file.txt"],
			options: [
				{ option_id: "allow", name: "Allow", kind: "allow_once" },
				{ option_id: "deny", name: "Deny", kind: "reject_once" },
				{ option_id: "allow_all", name: "Allow always", kind: "allow_always" },
			],
		};

		render(<PermissionRequestManager />);

		await waitFor(() => expect(permissionListener).toBeInstanceOf(Function));
		act(() => permissionListener?.(payload));

		expect(screen.getByText(/read file/)).toBeInTheDocument();
		expect(screen.getByText("/workspace/file.txt")).toBeInTheDocument();
		expect(screen.getByLabelText(/Allow always/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Allow/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Deny/ })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Allow/ }));

		await waitFor(() =>
			expect(decidePermissionMock).toHaveBeenCalledWith({
				request_id: "req-1",
				option_id: "allow",
				outcome: "AllowOnce",
			}),
		);
	});

	it("supports keyboard shortcuts (Enter -> allow, Esc -> cancel) and queues multiple requests", async () => {
		const first = {
			request_id: "req-1",
			session_id: "s1",
			tool_call_id: "t1",
			tool_title: "first",
			locations: [],
			options: [{ option_id: "allow", name: "Allow", kind: "allow_once" }],
		};
		const second = {
			request_id: "req-2",
			session_id: "s1",
			tool_call_id: "t2",
			tool_title: "second",
			locations: [],
			options: [{ option_id: "deny", name: "Deny", kind: "reject_once" }],
		};

		render(<PermissionRequestManager />);
		await waitFor(() => expect(permissionListener).toBeInstanceOf(Function));
		act(() => permissionListener?.(first));
		act(() => permissionListener?.(second));

		expect(screen.getByText("first")).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Enter" });

		await waitFor(() =>
			expect(decidePermissionMock).toHaveBeenCalledWith({
				request_id: "req-1",
				option_id: "allow",
				outcome: "AllowOnce",
			}),
		);

		expect(screen.getByText("second")).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() =>
			expect(decidePermissionMock).toHaveBeenCalledWith({
				request_id: "req-2",
				option_id: "deny",
				outcome: "RejectOnce",
			}),
		);
	});
});
