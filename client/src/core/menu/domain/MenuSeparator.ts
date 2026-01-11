import type { MenuVisitor } from "./MenuNode";
import { MenuNode } from "./MenuNode";

/**
 * Represents a visual separator between menu items (Composite Pattern: Leaf).
 */
export class MenuSeparator extends MenuNode {
	constructor() {
		super("separator", "");
	}

	accept<T>(visitor: MenuVisitor<T>): T {
		return visitor.visitSeparator(this);
	}

	getChildren(): MenuNode[] {
		return [];
	}
}
