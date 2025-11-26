import { useMemo, useState } from "react";
import { IconKeyboard } from "@/components/shared";
import { SHORTCUT_GROUPS } from "@/constants/shortcuts";
import { ModalShell } from "./ModalShell";

interface KeyboardShortcutsModalProps {
	open: boolean;
	onClose: () => void;
}

export function KeyboardShortcutsModal({
	open,
	onClose,
}: KeyboardShortcutsModalProps): JSX.Element | null {
	const [query, setQuery] = useState("");

	const normalizedQuery = query.trim().toLowerCase();
	const filteredGroups = useMemo(() => {
		if (!normalizedQuery) {
			return SHORTCUT_GROUPS;
		}

		return SHORTCUT_GROUPS.map((group) => ({
			...group,
			items: group.items.filter((item) =>
				`${item.keys.join(" ")} ${item.description}`.toLowerCase().includes(normalizedQuery),
			),
		})).filter((group) => group.items.length > 0);
	}, [normalizedQuery]);

	return (
		<ModalShell
			open={open}
			onClose={() => {
				setQuery("");
				onClose();
			}}
			title="Keyboard Shortcuts"
			subtitle="Stay in flow with quick commands"
			icon={<IconKeyboard width={24} height={24} aria-hidden />}
			maxWidth={760}
		>
			<div className="shortcuts-search">
				<input
					type="search"
					placeholder="Filter shortcuts"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					aria-label="Filter shortcuts"
				/>
			</div>
			<div className="shortcuts-grid">
				{filteredGroups.map((group) => (
					<div key={group.title} className="shortcut-group">
						<div className="shortcut-group-header">{group.title}</div>
						{group.items.map((item) => (
							<div key={item.id} className="shortcut-card">
								<div className="shortcut-keys">
									{item.keys.map((combo) => (
										<span key={`${item.id}-${combo}`} className="keycap">
											{combo}
										</span>
									))}
								</div>
								<div className="shortcut-details">
									<span className="shortcut-description">{item.description}</span>
									{item.scope && <span className="shortcut-scope">{item.scope}</span>}
								</div>
							</div>
						))}
					</div>
				))}
				{filteredGroups.length === 0 && (
					<div className="shortcuts-empty">
						No shortcuts match “{query}”. Try a different search.
					</div>
				)}
			</div>
		</ModalShell>
	);
}
