import type { MenuVisitor } from "./MenuNode";
import { MenuNode } from "./MenuNode";

/**
 * Represents a leaf menu item (Composite Pattern: Leaf).
 * Contains the action, keyboard shortcut, and state conditions.
 */
export class MenuItem extends MenuNode {
	constructor(
		id: string,
		label: string,
		public readonly commandId: string,
		public readonly shortcut?: string,
		public readonly description?: string,
		public readonly prominent?: boolean,
	) {
		super(id, label);
	}

	accept<T>(visitor: MenuVisitor<T>): T {
		return visitor.visitItem(this);
	}

	getChildren(): MenuNode[] {
		return [];
	}
}
