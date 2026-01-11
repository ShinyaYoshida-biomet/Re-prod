/**
 * Specification Pattern: Generic interface for state-based conditions.
 * Encapsulates state logic into reusable, testable objects.
 *
 * @template TContext The type of state snapshot this condition operates on
 */
export interface Condition<TContext = any> {
	/**
	 * Check if this condition is satisfied given the current state.
	 * @param context Current state snapshot
	 * @returns true if the condition is met
	 */
	isSatisfiedBy(context: TContext): boolean;
}

/**
 * Condition that is always satisfied (used when no condition is specified).
 */
export class AlwaysTrue<TContext = any> implements Condition<TContext> {
	isSatisfiedBy(_context: TContext): boolean {
		return true;
	}
}

/**
 * Logical AND combinator for conditions.
 */
export class AndCondition<TContext = any> implements Condition<TContext> {
	constructor(private readonly conditions: Condition<TContext>[]) {}

	isSatisfiedBy(context: TContext): boolean {
		return this.conditions.every((cond) => cond.isSatisfiedBy(context));
	}
}

/**
 * Logical OR combinator for conditions.
 */
export class OrCondition<TContext = any> implements Condition<TContext> {
	constructor(private readonly conditions: Condition<TContext>[]) {}

	isSatisfiedBy(context: TContext): boolean {
		return this.conditions.some((cond) => cond.isSatisfiedBy(context));
	}
}

/**
 * Logical NOT for conditions.
 */
export class NotCondition<TContext = any> implements Condition<TContext> {
	constructor(private readonly condition: Condition<TContext>) {}

	isSatisfiedBy(context: TContext): boolean {
		return !this.condition.isSatisfiedBy(context);
	}
}
