import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
	buildPromptWithContext,
	createRequestId,
	REMOTE_FILE_ACTIONS,
	CONSOLE_CONTEXT_LIMITS,
} from "../promptUtils";
import type { ExecutionLogEntry } from "@/types";

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

	describe("CONSOLE_CONTEXT_LIMITS", () => {
		it("should have correct limit values", () => {
			expect(CONSOLE_CONTEXT_LIMITS.maxItems).toBe(3);
			expect(CONSOLE_CONTEXT_LIMITS.maxSnippetLength).toBe(800);
			expect(CONSOLE_CONTEXT_LIMITS.maxLines).toBe(20);
		});
	});

	describe("buildPromptWithContext", () => {
		it("should build prompt with file path, content and user input", () => {
			const filepath = "script.R";
			const editorContent = "x <- 1\ny <- 2";
			const userInput = "What does this code do?";

			const prompt = buildPromptWithContext(filepath, editorContent, userInput);

			expect(prompt).toContain("Current file (script.R):");
			expect(prompt).toContain("```r\nx <- 1\ny <- 2\n```");
			expect(prompt).toContain("What does this code do?");
		});

		it("should use 'current editor buffer' when filepath is empty", () => {
			const prompt = buildPromptWithContext("", "x <- 1", "Question");

			expect(prompt).toContain("Current file (current editor buffer):");
		});

		it("should handle empty editor content", () => {
			const prompt = buildPromptWithContext("test.R", "", "Question");

			expect(prompt).toContain("```r\n\n```");
		});

		it("should include console history when provided", () => {
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "x <- 1",
					timestamp: Date.now(),
					duration: 100,
					success: true,
					stdout: "[1] 1",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			expect(prompt).toContain("Recent console output");
			expect(prompt).toContain("success");
			expect(prompt).toContain("stdout: [1] 1");
		});

		it("should limit console history to 3 most recent items", () => {
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "x <- 1",
					timestamp: Date.now() - 4000,
					duration: 100,
					success: true,
					stdout: "old",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
				{
					id: "2",
					code: "x <- 2",
					timestamp: Date.now() - 3000,
					duration: 100,
					success: true,
					stdout: "item2",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
				{
					id: "3",
					code: "x <- 3",
					timestamp: Date.now() - 2000,
					duration: 100,
					success: true,
					stdout: "item3",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
				{
					id: "4",
					code: "x <- 4",
					timestamp: Date.now() - 1000,
					duration: 100,
					success: true,
					stdout: "recent",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			// Should include recent items but not the oldest
			expect(prompt).toContain("recent");
			expect(prompt).toContain("item3");
			expect(prompt).toContain("item2");
			expect(prompt).not.toContain("old");
		});

		it("should truncate long stdout output", () => {
			const longOutput = "a".repeat(900);
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "print(longString)",
					timestamp: Date.now(),
					duration: 100,
					success: true,
					stdout: longOutput,
					stderr: "",
					plots: [],
					hasPlots: false,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			expect(prompt).toContain("(truncated)");
		});

		it("should truncate output to last 20 lines", () => {
			const manyLines = Array.from({ length: 30 }, (_, i) => `output line ${i + 1}`).join("\n");
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "print(many)",
					timestamp: Date.now(),
					duration: 100,
					success: true,
					stdout: manyLines,
					stderr: "",
					plots: [],
					hasPlots: false,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			// Should include recent lines
			expect(prompt).toContain("output line 30");
			expect(prompt).toContain("output line 20");
			expect(prompt).toContain("output line 11");
			// Should not include early lines
			expect(prompt).not.toContain("output line 1\n");
			expect(prompt).not.toContain("output line 10\n");
		});

		it("should include stderr in console context", () => {
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "stop('error')",
					timestamp: Date.now(),
					duration: 100,
					success: false,
					stdout: "",
					stderr: "Error: error message",
					plots: [],
					hasPlots: false,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			expect(prompt).toContain("stderr: Error: error message");
			expect(prompt).toContain("error");
		});

		it("should include plot information in console context", () => {
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "plot(1:10)",
					timestamp: Date.now(),
					duration: 200,
					success: true,
					stdout: "",
					stderr: "",
					plots: [
						{ path: "/tmp/plot1.png", timestamp: Date.now() },
						{ path: "/tmp/plot2.png", timestamp: Date.now() },
					],
					hasPlots: true,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			expect(prompt).toContain("plots: 2");
			expect(prompt).toContain("/tmp/plot1.png");
			expect(prompt).toContain("/tmp/plot2.png");
		});

		it("should limit plot paths to first 3", () => {
			const plots = Array.from({ length: 5 }, (_, i) => ({
				path: `/tmp/plot${i + 1}.png`,
				timestamp: Date.now(),
			}));

			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "plot()",
					timestamp: Date.now(),
					duration: 200,
					success: true,
					stdout: "",
					stderr: "",
					plots,
					hasPlots: true,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			expect(prompt).toContain("plots: 5");
			expect(prompt).toContain("/tmp/plot1.png");
			expect(prompt).toContain("/tmp/plot2.png");
			expect(prompt).toContain("/tmp/plot3.png");
			expect(prompt).not.toContain("/tmp/plot4.png");
			expect(prompt).not.toContain("/tmp/plot5.png");
		});

		it("should show console output in reverse order (newest first)", () => {
			const consoleHistory: ExecutionLogEntry[] = [
				{
					id: "1",
					code: "first",
					timestamp: Date.now() - 2000,
					duration: 100,
					success: true,
					stdout: "first output",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
				{
					id: "2",
					code: "second",
					timestamp: Date.now() - 1000,
					duration: 100,
					success: true,
					stdout: "second output",
					stderr: "",
					plots: [],
					hasPlots: false,
				},
			];

			const prompt = buildPromptWithContext("test.R", "x <- 1", "Question", consoleHistory);

			const secondIndex = prompt.indexOf("second output");
			const firstIndex = prompt.indexOf("first output");

			expect(secondIndex).toBeLessThan(firstIndex);
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
