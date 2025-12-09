export interface Command {
	id: string;
	title: string;
	category?: string;
	keybinding?: string;
	description?: string;
	execute: (...args: any[]) => void | Promise<void>;
	enabled?: () => boolean;
	checked?: () => boolean;
}

class CommandRegistry {
	private commands = new Map<string, Command>();

	register(command: Command): void {
		if (this.commands.has(command.id)) {
		}
		this.commands.set(command.id, command);
	}

	registerMany(commands: Command[]): void {
		commands.forEach((cmd) => this.register(cmd));
	}

	get(id: string): Command | undefined {
		return this.commands.get(id);
	}

	getAll(): Command[] {
		return Array.from(this.commands.values());
	}

	execute(id: string, ...args: any[]): void | Promise<void> {
		const command = this.commands.get(id);
		if (!command) {
			return;
		}

		if (command.enabled && !command.enabled()) {
			return;
		}

		try {
			return command.execute(...args);
		} catch (error) {}
	}

	/**
	 * Unregister a command (useful for cleanup if needed)
	 */
	unregister(id: string): void {
		this.commands.delete(id);
	}
}

export const commandRegistry = new CommandRegistry();
