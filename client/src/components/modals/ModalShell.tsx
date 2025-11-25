import { type ReactNode, useEffect, useId } from "react";

interface ModalShellProps {
	open: boolean;
	onClose: () => void;
	title: string;
	icon?: ReactNode;
	subtitle?: string;
	maxWidth?: number;
	footer?: ReactNode;
	children: ReactNode;
}

export function ModalShell({
	open,
	onClose,
	title,
	icon,
	subtitle,
	maxWidth = 640,
	footer,
	children,
}: ModalShellProps): JSX.Element | null {
	const labelId = useId();

	useEffect(() => {
		if (!open) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	if (!open) {
		return null;
	}

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div
				className="modal-dialog"
				style={{ maxWidth }}
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby={`${labelId}-title`}
			>
				<div className="modal-header">
					<div className="modal-title">
						{icon && <span className="modal-title-icon">{icon}</span>}
						<div>
							<h2 id={`${labelId}-title`}>{title}</h2>
							{subtitle && <p className="modal-subtitle">{subtitle}</p>}
						</div>
					</div>
					<button className="btn btn-icon" onClick={onClose} aria-label="Close dialog">
						×
					</button>
				</div>
				<div className="modal-body">{children}</div>
				{footer && <div className="modal-footer">{footer}</div>}
			</div>
		</div>
	);
}
