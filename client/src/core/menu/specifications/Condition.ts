import type { MenuStateSnapshot } from "../menuConfig";

/**
 * Specification Pattern: Interface for menu item conditions.
 * Encapsulates state logic into reusable, testable objects.
 */
export interface Condition {
	/**
	 * Check if this condition is satisfied given the current state.
	 * @param context Current menu state snapshot
	 * @returns true if the condition is met
	 */
	isSatisfiedBy(context: MenuStateSnapshot): boolean;
}

/**
 * Condition that is always satisfied (used when no condition is specified).
 */
export class AlwaysTrue implements Condition {
	isSatisfiedBy(_context: MenuStateSnapshot): boolean {
		return true;
	}
}

/**
 * Logical AND combinator for conditions.
 */
export class AndCondition implements Condition {
	constructor(private readonly conditions: Condition[]) {}

	isSatisfiedBy(context: MenuStateSnapshot): boolean {
		return this.conditions.every((cond) => cond.isSatisfiedBy(context));
	}
}

/**
 * Logical OR combinator for conditions.
 */
export class OrCondition implements Condition {
	constructor(private readonly conditions: Condition[]) {}

	isSatisfiedBy(context: MenuStateSnapshot): boolean {
		return this.conditions.some((cond) => cond.isSatisfiedBy(context));
	}
}

/**
 * Logical NOT for conditions.
 */
export class NotCondition implements Condition {
	constructor(private readonly condition: Condition) {}

	isSatisfiedBy(context: MenuStateSnapshot): boolean {
		return !this.condition.isSatisfiedBy(context);
	}
}
