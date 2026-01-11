import type { CommandWithConditions } from "../builders";
import type { Command } from "../registry";
import type { CommandStateSnapshot } from "../specifications";

/**
 * Resolves CommandWithConditions to Command by evaluating conditions
 * against the current application state.
 *
 * This class bridges the domain model (CommandWithConditions with Condition objects)
 * and the runtime model (Command with function predicates).
 */
export class CommandResolver {
	private constructor(private readonly snapshot: CommandStateSnapshot) {}

	/**
	 * Resolve commands with conditions to executable commands.
	 * @param commands Commands with condition metadata
	 * @param snapshot Current application state
	 * @returns Commands with evaluated condition functions
	 */
	static resolve(commands: CommandWithConditions[], snapshot: CommandStateSnapshot): Command[] {
		const resolver = new CommandResolver(snapshot);
		return commands.map((cmd) => resolver.resolveCommand(cmd));
	}

	private resolveCommand(cmd: CommandWithConditions): Command {
		const baseCommand: Command = {
			id: cmd.id,
			title: cmd.title,
			execute: cmd.execute,
			category: cmd.category,
			keybinding: cmd.keybinding,
			description: cmd.description,
		};

		// Convert enabledWhen condition to enabled function
		if (cmd.enabledWhen) {
			const enabledWhen = cmd.enabledWhen;
			baseCommand.enabled = () => enabledWhen.isSatisfiedBy(this.snapshot);
		}

		// Convert checkedWhen condition to checked function
		if (cmd.checkedWhen) {
			const checkedWhen = cmd.checkedWhen;
			baseCommand.checked = () => checkedWhen.isSatisfiedBy(this.snapshot);
		}

		return baseCommand;
	}
}
