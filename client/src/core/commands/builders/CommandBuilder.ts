import type { Command } from "../registry";
import type { Condition } from "../specifications";

/**
 * Command with condition metadata for builder pattern.
 * Extends the base Command interface with condition objects.
 */
export interface CommandWithConditions extends Command {
	enabledWhen?: Condition;
	checkedWhen?: Condition;
}

/**
 * Builder for creating commands with fluent API.
 * Separates command structure definition from condition evaluation.
 *
 * Example usage:
 * ```typescript
 * const commands = CommandBuilder.create()
 *   .command("view.toggleFiles", "Toggle Files Pane")
 *   .keybinding("Mod+Shift+E")
 *   .checkedWhen(new IsViewPaneVisible("files"))
 *   .handler(() => togglePane("files"))
 *   .build();
 * ```
 */
export class CommandBuilder {
	private commands: CommandWithConditions[] = [];
	private currentCommand: Partial<CommandWithConditions> | null = null;

	private constructor() {}

	/**
	 * Create a new CommandBuilder instance.
	 */
	static create(): CommandBuilder {
		return new CommandBuilder();
	}

	/**
	 * Start defining a new command.
	 * @param id Unique command identifier
	 * @param title Human-readable command title
	 */
	command(id: string, title: string): this {
		// Finalize previous command if any
		if (this.currentCommand?.id && this.currentCommand?.execute) {
			this.commands.push(this.currentCommand as CommandWithConditions);
		}

		this.currentCommand = {
			id,
			title,
		};

		return this;
	}

	/**
	 * Set the command execution handler.
	 * @param handler Function to execute when command is triggered
	 */
	handler(handler: (...args: any[]) => void | Promise<void>): this {
		if (!this.currentCommand) {
			throw new Error("Call command() before handler()");
		}

		this.currentCommand.execute = handler;
		return this;
	}

	/**
	 * Set the command category (e.g., "View", "Code", "File").
	 * @param category Category name
	 */
	category(category: string): this {
		if (!this.currentCommand) {
			throw new Error("Call command() before category()");
		}

		this.currentCommand.category = category;
		return this;
	}

	/**
	 * Set the keyboard shortcut for this command.
	 * @param keybinding Keyboard shortcut (e.g., "Mod+S")
	 */
	keybinding(keybinding: string): this {
		if (!this.currentCommand) {
			throw new Error("Call command() before keybinding()");
		}

		this.currentCommand.keybinding = keybinding;
		return this;
	}

	/**
	 * Set the command description.
	 * @param description Human-readable description
	 */
	description(description: string): this {
		if (!this.currentCommand) {
			throw new Error("Call command() before description()");
		}

		this.currentCommand.description = description;
		return this;
	}

	/**
	 * Set the condition for when this command should be enabled.
	 * @param condition Condition to check
	 */
	enabledWhen(condition: Condition): this {
		if (!this.currentCommand) {
			throw new Error("Call command() before enabledWhen()");
		}

		this.currentCommand.enabledWhen = condition;
		return this;
	}

	/**
	 * Set the condition for when this command should show as checked.
	 * @param condition Condition to check
	 */
	checkedWhen(condition: Condition): this {
		if (!this.currentCommand) {
			throw new Error("Call command() before checkedWhen()");
		}

		this.currentCommand.checkedWhen = condition;
		return this;
	}

	/**
	 * Build and return all defined commands.
	 * @returns Array of commands with condition metadata
	 */
	build(): CommandWithConditions[] {
		// Finalize last command
		if (this.currentCommand?.id && this.currentCommand?.execute) {
			this.commands.push(this.currentCommand as CommandWithConditions);
		}

		return this.commands;
	}
}
