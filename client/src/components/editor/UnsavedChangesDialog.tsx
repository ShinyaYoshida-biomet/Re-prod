interface UnsavedChangesDialogProps {
	open: boolean;
	filename: string;
	onSave: () => void;
	onDontSave: () => void;
	onCancel: () => void;
}

export function UnsavedChangesDialog({
	open,
	filename,
	onSave,
	onDontSave,
	onCancel,
}: UnsavedChangesDialogProps): JSX.Element | null {
	if (!open) return null;

	const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>): void => {
		if (event.target === event.currentTarget) {
			onCancel();
		}
	};

	return (
		<div className="confirm-dialog-overlay" onClick={handleOverlayClick} role="presentation">
			<div
				className="confirm-dialog"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="unsaved-dialog-title"
				aria-describedby="unsaved-dialog-message"
			>
				<div className="confirm-dialog-header">
					<h2 id="unsaved-dialog-title">{`Save changes to "${filename}"?`}</h2>
					<button type="button" className="btn btn-icon" onClick={onCancel}>
						×
					</button>
				</div>
				<div className="confirm-dialog-content">
					<p id="unsaved-dialog-message" className="confirm-dialog-message">
						Your changes will be lost if you don't save them.
					</p>
				</div>
				<div className="confirm-dialog-footer">
					<button type="button" className="btn" onClick={onDontSave}>
						Don't Save
					</button>
					<button type="button" className="btn" onClick={onCancel}>
						Cancel
					</button>
					<button type="button" className="btn btn-primary" onClick={onSave}>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
