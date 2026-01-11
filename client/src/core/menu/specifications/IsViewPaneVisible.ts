import type { ViewPane } from "@/core/state/slices/viewSlice";
import type { MenuStateSnapshot } from "../menuConfig";
import type { Condition } from "./Condition";

/**
 * Condition: Specific view pane is visible.
 */
export class IsViewPaneVisible implements Condition {
	constructor(private readonly pane: ViewPane) {}

	isSatisfiedBy(context: MenuStateSnapshot): boolean {
		return context.viewPanes[this.pane] ?? false;
	}
}
