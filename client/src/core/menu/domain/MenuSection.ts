import type { MenuVisitor } from "./MenuNode";
import { MenuNode } from "./MenuNode";

/**
 * Represents a menu section containing items (Composite Pattern: Composite).
 * Can contain MenuItem, MenuSeparator, or nested MenuSection instances.
 */
export class MenuSection extends MenuNode {
	private items: MenuNode[] = [];

	constructor(id: string, label: string) {
		super(id, label);
	}

	/**
	 * Add a child node to this section.
	 */
	addItem(item: MenuNode): void {
		this.items.push(item);
	}

	/**
	 * Get all items in this section.
	 */
	getChildren(): MenuNode[] {
		return [...this.items];
	}

	accept<T>(visitor: MenuVisitor<T>): T {
		return visitor.visitSection(this);
	}
}
