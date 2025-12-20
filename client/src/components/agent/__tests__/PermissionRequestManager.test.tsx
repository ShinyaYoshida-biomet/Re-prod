import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PermissionRequestManager } from "../PermissionRequestManager";

vi.mock("@/constants/features", () => ({
	ACP_FEATURE_ENABLED: true,
	IS_TAURI: true,
}));

const invokeMock = vi.fn();
let listener: ((event: { payload: any }) => void) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: any[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: (_evt: string, handler: (event: { payload: any }) => void) => {
		listener = handler;
		return Promise.resolve(() => {
			listener = null;
		});
	},
}));

describe("PermissionRequestManager", () => {
	beforeEach(() => {
		invokeMock.mockReset();
		listener = null;
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

		await waitFor(() => expect(listener).toBeInstanceOf(Function));
		act(() => listener?.({ payload }));

		expect(screen.getByText(/read file/)).toBeInTheDocument();
		expect(screen.getByText("/workspace/file.txt")).toBeInTheDocument();
		expect(screen.getByLabelText(/Allow always/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Allow/ })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Deny/ })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Allow/ }));

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith("acp_respond_to_permission", {
				decision: {
					request_id: "req-1",
					option_id: "allow",
					outcome: "AllowOnce",
				},
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
		await waitFor(() => expect(listener).toBeInstanceOf(Function));
		act(() => listener?.({ payload: first }));
		act(() => listener?.({ payload: second }));

		expect(screen.getByText("first")).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Enter" });

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith("acp_respond_to_permission", {
				decision: { request_id: "req-1", option_id: "allow", outcome: "AllowOnce" },
			}),
		);

		expect(screen.getByText("second")).toBeInTheDocument();
		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith("acp_respond_to_permission", {
				decision: { request_id: "req-2", option_id: "deny", outcome: "RejectOnce" },
			}),
		);
	});
});
