import { commandRegistry } from "@/core/commands/registry";
import type { MenuEntry, MenuSection as LegacyMenuSection } from "@/types/menu";
import type { MenuItemWithConditions } from "../builders";
import type { MenuNode } from "../domain";
import { MenuItem, MenuSection } from "../domain";
import type { MenuStateSnapshot } from "../menuConfig";
import { AlwaysTrue } from "../specifications";

/**
 * Resolves menu domain model into legacy MenuSection types.
 * Evaluates conditions against current state and generates enabled/checked predicates.
 */
export class MenuResolver {
	constructor(private readonly snapshot: MenuStateSnapshot) {}

	/**
	 * Resolve a menu structure against the current state.
	 */
	static resolve(sections: MenuSection[], snapshot: MenuStateSnapshot): LegacyMenuSection[] {
		const resolver = new MenuResolver(snapshot);
		return sections.map((section) => resolver.resolveSection(section));
	}

	private resolveSection(section: MenuSection): LegacyMenuSection {
		return {
			id: section.id as any, // MenuSectionId
			label: section.label,
			items: section.getChildren().map((child) => this.resolveNode(child)),
		};
	}

	private resolveNode(node: MenuNode): MenuEntry {
		if (node instanceof MenuItem) {
			return this.resolveItem(node);
		}
		// MenuSeparator
		return { type: "separator" };
	}

	private resolveItem(node: MenuItem): MenuEntry {
		const item = node as MenuItem & MenuItemWithConditions;

		const enabledWhen = item.enabledWhen || new AlwaysTrue();
		const checkedWhen = (item as any).checkedWhen;

		const baseItem = {
			id: item.id,
			label: item.label,
			shortcut: item.shortcut,
			action: () => commandRegistry.execute(item.commandId),
			enabled: () => enabledWhen.isSatisfiedBy(this.snapshot),
			description: item.description,
			prominent: item.prominent,
		};

		if (checkedWhen) {
			return {
				...baseItem,
				checked: () => checkedWhen.isSatisfiedBy(this.snapshot),
			};
		}

		return baseItem;
	}
}
