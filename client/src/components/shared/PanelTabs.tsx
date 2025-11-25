import type { ReactNode } from "react";

export interface PanelTabItem<T extends string> {
	id: T;
	label: ReactNode;
	disabled?: boolean;
}

interface PanelTabsProps<T extends string> {
	items: PanelTabItem<T>[];
	activeId: T;
	onSelect: (id: T) => void;
	className?: string;
}

export function PanelTabs<T extends string>({
	items,
	activeId,
	onSelect,
	className,
}: PanelTabsProps<T>): JSX.Element {
	const containerClass = ["tabs", className].filter(Boolean).join(" ");

	return (
		<div className={containerClass}>
			{items.map((item) => {
				const isActive = item.id === activeId;

				return (
					<button
						key={item.id}
						type="button"
						className={`tab${isActive ? " active" : ""}`}
						onClick={() => onSelect(item.id)}
						disabled={item.disabled}
					>
						{item.label}
					</button>
				);
			})}
		</div>
	);
}
