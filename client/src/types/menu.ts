/**
 * Menu System Type Definitions
 *
 * Simple but expressive type system for describing the desktop‑style menu
 * that powers Re-prod. These types are deliberately verbose so that other
 * modules can reuse them when constructing menu sections, registering
 * shortcuts, or rendering menus outside of the default menubar.
 */

/** Finite set of top-level sections in the UI menu */
export type MenuSectionId = "file" | "edit" | "code" | "session" | "view" | "help";

/** Optional metadata for hinting about menu usage */
export interface MenuHint {
	/** Additional context shown in tooltips or secondary UI */
	description?: string;
	/** Highlight visually (used for AI Assistant) */
	prominent?: boolean;
}

/** Functions used across menu items */
export type MenuActionHandler = () => void;
export type MenuAvailabilityPredicate = () => boolean;
export type MenuCheckedPredicate = () => boolean;

/** Base menu item – executes an action when clicked */
export interface MenuCommandItem extends MenuHint {
	id: string;
	label: string;
	shortcut?: string;
	action: MenuActionHandler;
	enabled?: MenuAvailabilityPredicate;
}

/** Toggle style menu item with a persistent checked state */
export interface MenuToggleItem extends MenuCommandItem {
	checked: MenuCheckedPredicate;
}

export type MenuItem = MenuCommandItem | MenuToggleItem;

/** Menu separator (horizontal divider between groups) */
export interface MenuSeparator {
	type: "separator";
}

export type MenuEntry = MenuItem | MenuSeparator;

/** Menu section (File, Edit, Code, Session, View, Help) */
export interface MenuSection {
	id: MenuSectionId;
	label: string;
	items: MenuEntry[];
}

/** Render props shared by menu section renderers */
export interface MenuSectionComponentProps {
	section: MenuSection;
	isOpen: boolean;
	anyMenuOpen: boolean;
	onOpenExplicit: (label: string) => void;
	onClose: () => void;
}

/** Props for small status indicator used in the menubar */
export interface ConnectionIndicatorProps {
	isConnected: boolean;
}

/** Convenience structure for declaring full menu trees */
export interface MenuConfiguration {
	sections: MenuSection[];
}
