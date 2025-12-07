import { describe, it, expect, vi, beforeEach } from "vitest";
import { commandRegistry } from "./registry";

describe("CommandRegistry", () => {
	it("should register and execute a command", () => {
		const executeMock = vi.fn();
		const command = {
			id: "test.command1",
			title: "Test Command",
			execute: executeMock,
		};

		commandRegistry.register(command);
		const retrieved = commandRegistry.get("test.command1");
		expect(retrieved).toBeDefined();
		expect(retrieved?.id).toBe("test.command1");

		commandRegistry.execute("test.command1");
		expect(executeMock).toHaveBeenCalled();
	});

	it("should not execute disabled command", () => {
		const executeMock = vi.fn();
		const command = {
			id: "test.disabled",
			title: "Disabled Command",
			execute: executeMock,
			enabled: () => false,
		};

		commandRegistry.register(command);
		commandRegistry.execute("test.disabled");
		expect(executeMock).not.toHaveBeenCalled();
	});

	it("should execute enabled command", () => {
		const executeMock = vi.fn();
		const command = {
			id: "test.enabled",
			title: "Enabled Command",
			execute: executeMock,
			enabled: () => true,
		};

		commandRegistry.register(command);
		commandRegistry.execute("test.enabled");
		expect(executeMock).toHaveBeenCalled();
	});

	it("should handle missing command gracefully", () => {
		// Should not throw
		commandRegistry.execute("non.existent.command");
	});
});
