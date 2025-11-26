interface ConfirmDialogProps {
	open: boolean;
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title,
	message,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
}: ConfirmDialogProps): JSX.Element | null {
	if (!open) return null;

	const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	};

	const handleConfirm = (): void => {
		onConfirm();
	};

	const handleCancel = (): void => {
		onCancel();
	};

	return (
		<div className="confirm-dialog-overlay" onClick={handleOverlayClick} role="presentation">
			<div
				className="confirm-dialog"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="confirm-dialog-title"
				aria-describedby="confirm-dialog-message"
			>
				<div className="confirm-dialog-header">
					<h2 id="confirm-dialog-title">{title}</h2>
					<button className="btn btn-icon" onClick={handleCancel} aria-label="Close dialog">
						×
					</button>
				</div>

				<div className="confirm-dialog-content">
					<p id="confirm-dialog-message" className="confirm-dialog-message">
						{message}
					</p>
				</div>

				<div className="confirm-dialog-footer">
					<button className="btn" onClick={handleCancel}>
						{cancelLabel}
					</button>
					<button className="btn btn-primary" onClick={handleConfirm}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
