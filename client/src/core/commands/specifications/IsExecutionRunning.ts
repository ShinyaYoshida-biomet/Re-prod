import type { Condition } from "../../specifications/Condition";
import type { CommandStateSnapshot } from "./CommandStateSnapshot";

/**
 * Specification: Check if R execution is currently running.
 * Used to enable/disable commands that depend on execution state.
 */
export class IsExecutionRunning implements Condition<CommandStateSnapshot> {
	isSatisfiedBy(context: CommandStateSnapshot): boolean {
		return context.isExecutionRunning;
	}
}
