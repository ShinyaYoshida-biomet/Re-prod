import { describe, expect, it, vi } from "vitest";
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

	it("should register multiple commands at once", () => {
		const cmd1 = { id: "cmd1", title: "Cmd 1", execute: vi.fn() };
		const cmd2 = { id: "cmd2", title: "Cmd 2", execute: vi.fn() };

		commandRegistry.registerMany([cmd1, cmd2]);

		expect(commandRegistry.get("cmd1")).toBeDefined();
		expect(commandRegistry.get("cmd2")).toBeDefined();
	});

	it("should unregister a command", () => {
		const cmd = { id: "cmdToUnregister", title: "Temp", execute: vi.fn() };
		commandRegistry.register(cmd);
		expect(commandRegistry.get("cmdToUnregister")).toBeDefined();

		commandRegistry.unregister("cmdToUnregister");
		expect(commandRegistry.get("cmdToUnregister")).toBeUndefined();
	});
});
