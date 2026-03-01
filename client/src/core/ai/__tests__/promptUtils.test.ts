import { describe, expect, it, vi } from "vitest";
import { createRequestId, REMOTE_FILE_ACTIONS } from "../promptUtils";

describe("promptUtils", () => {
	describe("REMOTE_FILE_ACTIONS", () => {
		it("should contain expected remote file actions", () => {
			expect(REMOTE_FILE_ACTIONS.has("create-file")).toBe(true);
			expect(REMOTE_FILE_ACTIONS.has("delete-range")).toBe(true);
			expect(REMOTE_FILE_ACTIONS.has("replace-range")).toBe(true);
		});

		it("should not contain non-remote actions", () => {
			expect(REMOTE_FILE_ACTIONS.has("insert")).toBe(false);
			expect(REMOTE_FILE_ACTIONS.has("replace-all")).toBe(false);
		});
	});

	describe("createRequestId", () => {
		it("should use crypto.randomUUID when available", () => {
			const mockUUID = "123e4567-e89b-12d3-a456-426614174000";

			vi.stubGlobal("crypto", {
				randomUUID: vi.fn().mockReturnValue(mockUUID),
			});

			const id = createRequestId();

			expect(id).toBe(mockUUID);

			vi.unstubAllGlobals();
		});

		it("should fall back to timestamp-based ID when crypto.randomUUID is unavailable", () => {
			vi.stubGlobal("crypto", undefined);

			const id = createRequestId();

			expect(id).toMatch(/^req-\d+-[a-f0-9]+$/);

			vi.unstubAllGlobals();
		});

		it("should generate unique IDs on each call (fallback)", () => {
			vi.stubGlobal("crypto", undefined);

			const id1 = createRequestId();
			const id2 = createRequestId();

			expect(id1).not.toBe(id2);

			vi.unstubAllGlobals();
		});

		it("should include timestamp in fallback ID", () => {
			const now = Date.now();
			vi.stubGlobal("crypto", undefined);

			const id = createRequestId();
			const timestampPart = id.split("-")[1];
			const timestamp = Number.parseInt(timestampPart, 10);

			expect(timestamp).toBeGreaterThanOrEqual(now);
			expect(timestamp).toBeLessThanOrEqual(Date.now());

			vi.unstubAllGlobals();
		});
	});
});
