/**
 * Abstract base class for all menu elements.
 * Implements the Composite Pattern to treat menu sections and items uniformly.
 */
export abstract class MenuNode {
	constructor(
		public readonly id: string,
		public readonly label: string,
	) {}

	/**
	 * Accept a visitor for traversing the menu tree.
	 * This allows operations on menu nodes without modifying their classes.
	 */
	abstract accept<T>(visitor: MenuVisitor<T>): T;

	/**
	 * Get all child nodes (for composite nodes).
	 * Returns empty array for leaf nodes.
	 */
	abstract getChildren(): MenuNode[];
}

/**
 * Visitor interface for traversing menu nodes.
 */
export interface MenuVisitor<T> {
	visitSection(section: MenuNode): T;
	visitItem(item: MenuNode): T;
	visitSeparator(separator: MenuNode): T;
}
