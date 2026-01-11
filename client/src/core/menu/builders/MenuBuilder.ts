import { MenuItem, MenuSection, MenuSeparator } from "../domain";
import type { Condition } from "../specifications";

/**
 * Fluent Builder for constructing menu structures declaratively.
 * Implements the Builder Pattern to separate menu construction from representation.
 */
export class MenuBuilder {
	private sections: MenuSection[] = [];
	private currentSection: MenuSection | null = null;

	private constructor() {}

	/**
	 * Create a new MenuBuilder instance.
	 */
	static create(): MenuBuilder {
		return new MenuBuilder();
	}

	/**
	 * Start a new menu section.
	 * @param id Section identifier
	 * @param label Display label
	 */
	section(id: string, label: string): MenuBuilder {
		this.currentSection = new MenuSection(id, label);
		this.sections.push(this.currentSection);
		return this;
	}

	/**
	 * Add a command item to the current section.
	 * @param id Item identifier
	 * @param label Display label
	 * @param commandId Command to execute
	 * @param options Additional options (shortcut, description, etc.)
	 */
	item(
		id: string,
		label: string,
		commandId: string,
		options?: {
			shortcut?: string;
			description?: string;
			prominent?: boolean;
			enabledWhen?: Condition;
			checkedWhen?: Condition;
		},
	): MenuBuilder {
		if (!this.currentSection) {
			throw new Error("Cannot add item without a section. Call section() first.");
		}

		const item = new MenuItem(
			id,
			label,
			commandId,
			options?.shortcut,
			options?.description,
			options?.prominent,
		);

		// Store conditions as metadata (we'll need to extend MenuItem for this)
		if (options?.enabledWhen) {
			(item as any).enabledWhen = options.enabledWhen;
		}
		if (options?.checkedWhen) {
			(item as any).checkedWhen = options.checkedWhen;
		}

		this.currentSection.addItem(item);
		return this;
	}

	/**
	 * Add a separator to the current section.
	 */
	separator(): MenuBuilder {
		if (!this.currentSection) {
			throw new Error("Cannot add separator without a section. Call section() first.");
		}

		this.currentSection.addItem(new MenuSeparator());
		return this;
	}

	/**
	 * Build and return the menu structure.
	 */
	build(): MenuSection[] {
		return this.sections;
	}
}

/**
 * Extended MenuItem with condition metadata.
 * This allows us to attach conditions without breaking the domain model.
 */
export interface MenuItemWithConditions extends MenuItem {
	enabledWhen?: Condition;
	checkedWhen?: Condition;
}
