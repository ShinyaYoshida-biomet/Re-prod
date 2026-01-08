import { useCallback, useMemo, useState } from "react";
import { useStore } from "@/core";
import { commandRegistry } from "@/core/commands/registry";
import type { Buffer } from "@/core/state/slices/editorSlice";
import { classNames } from "@/utils/classNames";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

const getDisplayName = (buffer: Buffer): string => {
	if (buffer.displayName) return buffer.displayName;
	if (!buffer.filepath) return "Untitled";
	const parts = buffer.filepath.split(/[\\/]/);
	return parts[parts.length - 1] ?? "Untitled";
};

export function TabBar(): JSX.Element {
	const buffers = useStore((state) => state.editor.buffers);
	const activeBufferId = useStore((state) => state.editor.activeBufferId);
	const setActiveBuffer = useStore((state) => state.setActiveBuffer);
	const removeBuffer = useStore((state) => state.removeBuffer);

	const [pendingClose, setPendingClose] = useState<Buffer | null>(null);

	const handleClose = useCallback(
		(event: React.MouseEvent, buffer: Buffer) => {
			event.stopPropagation();
			if (buffer.isDirty) {
				setPendingClose(buffer);
				return;
			}
			removeBuffer(buffer.id);
		},
		[removeBuffer],
	);

	const handleSave = useCallback(async () => {
		if (!pendingClose) return;
		setActiveBuffer(pendingClose.id);
		await commandRegistry.execute("file.save");
		const updated = useStore.getState().getBufferById(pendingClose.id);
		if (!updated || !updated.isDirty) {
			removeBuffer(pendingClose.id);
		}
		setPendingClose(null);
	}, [pendingClose, removeBuffer, setActiveBuffer]);

	const handleDontSave = useCallback(() => {
		if (!pendingClose) return;
		removeBuffer(pendingClose.id);
		setPendingClose(null);
	}, [pendingClose, removeBuffer]);

	const handleCancel = useCallback(() => {
		setPendingClose(null);
	}, []);

	const pendingFilename = useMemo(
		() => (pendingClose ? getDisplayName(pendingClose) : "Untitled"),
		[pendingClose],
	);

	return (
		<div className="tab-bar">
			<div className="tab-list" role="tablist" aria-label="Open files">
				{buffers.map((buffer) => (
					<div
						key={buffer.id}
						role="tab"
						aria-selected={buffer.id === activeBufferId}
						className={classNames("tab", buffer.id === activeBufferId && "active")}
						tabIndex={0}
						onClick={() => setActiveBuffer(buffer.id)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								setActiveBuffer(buffer.id);
							}
						}}
					>
						<span className="tab-label">
							{getDisplayName(buffer)}
							{buffer.isDirty && (
								<span className="tab-dirty-indicator" aria-hidden>
									•
								</span>
							)}
						</span>
						<button
							type="button"
							className="tab-close"
							onClick={(event) => handleClose(event, buffer)}
							aria-label="Close tab"
						>
							×
						</button>
					</div>
				))}
			</div>
			<button
				type="button"
				className="tab-new"
				onClick={() => commandRegistry.execute("file.new")}
				aria-label="New file"
			>
				+
			</button>
			<UnsavedChangesDialog
				open={Boolean(pendingClose)}
				filename={pendingFilename}
				onSave={handleSave}
				onDontSave={handleDontSave}
				onCancel={handleCancel}
			/>
		</div>
	);
}
