import type { ViewPane } from "@/core/state/slices/viewSlice";
import type { Condition } from "../../specifications/Condition";
import type { CommandStateSnapshot } from "./CommandStateSnapshot";

/**
 * Specification: Check if a specific view pane is visible.
 * Used for toggle commands that show/hide UI panes.
 */
export class IsViewPaneVisible implements Condition<CommandStateSnapshot> {
	constructor(private readonly pane: ViewPane) {}

	isSatisfiedBy(context: CommandStateSnapshot): boolean {
		return context.viewPanes[this.pane] === true;
	}
}
