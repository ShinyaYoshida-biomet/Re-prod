/**
 * MenuBar Component
 *
 * Main menu bar with 6 sections: File, Edit, Code, Session, View, Help
 */

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/core/state/store";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useMenuSections } from "@/hooks/useMenuSections";
import type { ConnectionIndicatorProps, MenuItem, MenuSectionComponentProps } from "@/types/menu";

export function MenuBar(): JSX.Element {
	const isConnected = useStore((state) => state.isConnected);
	const menuSections = useMenuSections();
	const [openSection, setOpenSection] = useState<string | null>(null);
	const menubarRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (!menubarRef.current?.contains(event.target as Node)) {
				setOpenSection(null);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpenSection(null);
			}
		};

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("touchstart", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("touchstart", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	const handleOpenSection = (label: string) => {
		setOpenSection(label);
	};

	const handleCloseMenus = () => setOpenSection(null);

	const isAnyMenuOpen = useMemo(() => openSection !== null, [openSection]);

	return (
		<div className="menubar" ref={menubarRef}>
			<div className="menubar-left">
				<span className="menubar-brand">Re-prod</span>
				<div className="menubar-menu">
					{menuSections.map((section) => (
						<MenuSectionComponent
							key={section.label}
							section={section}
							isOpen={openSection === section.label}
							anyMenuOpen={isAnyMenuOpen}
							onOpenExplicit={handleOpenSection}
							onClose={handleCloseMenus}
						/>
					))}
				</div>
			</div>
			<div className="menubar-right">
				<ConnectionIndicator isConnected={isConnected} />
			</div>
		</div>
	);
}

// Individual menu section component
function MenuSectionComponent({
	section,
	isOpen,
	anyMenuOpen,
	onOpenExplicit,
	onClose,
}: MenuSectionComponentProps) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const closeMenu = (focusButton = false) => {
		onClose();
		if (focusButton) {
			requestAnimationFrame(() => buttonRef.current?.focus());
		}
	};

	const getFocusableItems = useCallback((): HTMLButtonElement[] => {
		if (!menuRef.current) return [];
		return Array.from(
			menuRef.current.querySelectorAll<HTMLButtonElement>(
				'button[role="menuitem"]:not([disabled])',
			),
		);
	}, []);

	const focusFirstItem = useCallback(() => {
		const items = getFocusableItems();
		items[0]?.focus();
	}, [getFocusableItems]);

	const focusLastItem = useCallback(() => {
		const items = getFocusableItems();
		items[items.length - 1]?.focus();
	}, [getFocusableItems]);

	const handleButtonClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		if (isOpen) {
			closeMenu(true);
		} else {
			onOpenExplicit(section.label);
			requestAnimationFrame(focusFirstItem);
		}
	};

	const handleButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (!isOpen) {
				onOpenExplicit(section.label);
				requestAnimationFrame(focusFirstItem);
			} else {
				focusFirstItem();
			}
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			if (!isOpen) {
				onOpenExplicit(section.label);
				requestAnimationFrame(focusLastItem);
			} else {
				focusLastItem();
			}
		} else if (event.key === "Escape" && isOpen) {
			event.preventDefault();
			closeMenu(true);
		}
	};

	const handleMenuKeyDown = useListNavigation({
		getItems: getFocusableItems,
		onEscape: (focusButton) => closeMenu(focusButton),
		onTab: () => closeMenu(),
		wrap: true,
	});

	const handleMouseEnter = () => {
		if (anyMenuOpen && !isOpen) {
			onOpenExplicit(section.label);
		}
	};

	return (
		<div className="menu-section" onMouseEnter={handleMouseEnter}>
			<button
				ref={buttonRef}
				type="button"
				className={`menu-item ${isOpen ? "active" : ""}`}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				onClick={handleButtonClick}
				onKeyDown={handleButtonKeyDown}
			>
				{section.label}
			</button>
			<div
				ref={menuRef}
				className={`menu-dropdown ${isOpen ? "" : "hidden"}`}
				role="menu"
				aria-label={section.label}
				aria-hidden={!isOpen}
				onKeyDown={handleMenuKeyDown}
			>
				{section.items.map((item, index) => {
					if ("type" in item && item.type === "separator") {
						return (
							<div key={`sep-${index}`} className="menu-dropdown-separator" role="separator" />
						);
					}

					const menuItem = item as MenuItem;
					const isEnabled = menuItem.enabled ? menuItem.enabled() : true;
					const isToggleItem = "checked" in menuItem;
					const isChecked = isToggleItem ? menuItem.checked() : false;

					return (
						<button
							key={menuItem.id}
							type="button"
							role="menuitem"
							className="menu-dropdown-item"
							data-id={menuItem.id}
							data-disabled={!isEnabled}
							data-checked={isToggleItem ? isChecked : undefined}
							disabled={!isEnabled}
							onClick={() => {
								menuItem.action();
								closeMenu();
							}}
						>
							<span className="menu-item-label">
								{isToggleItem ? (
									<span className="menu-item-check">{isChecked ? "✓" : ""}</span>
								) : null}
								{menuItem.label}
							</span>
							{menuItem.shortcut && <span className="menu-item-shortcut">{menuItem.shortcut}</span>}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// Connection indicator component
function ConnectionIndicator({ isConnected }: ConnectionIndicatorProps) {
	return (
		<div className={`connection-indicator ${isConnected ? "connected" : "disconnected"}`}>
			<span className="connection-dot"></span>
			<span className="connection-text">{isConnected ? "Connected" : "Disconnected"}</span>
		</div>
	);
}
