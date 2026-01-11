import type { MenuStateSnapshot } from "../menuConfig";
import type { Condition } from "./Condition";

/**
 * Condition: R execution is currently running.
 */
export class IsExecutionRunning implements Condition {
	isSatisfiedBy(context: MenuStateSnapshot): boolean {
		return context.isExecutionRunning;
	}
}
