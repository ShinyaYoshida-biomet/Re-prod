import { useEffect, useRef, useState } from "react";

interface PromptDialogProps {
	open: boolean;
	title: string;
	message?: string;
	defaultValue?: string;
	placeholder?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: (value: string) => void;
	onCancel: () => void;
}

export function PromptDialog({
	open,
	title,
	message,
	defaultValue = "",
	placeholder = "",
	confirmLabel = "OK",
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
}: PromptDialogProps): JSX.Element | null {
	const [value, setValue] = useState(defaultValue);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setValue(defaultValue);
			// Focus input on open
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open, defaultValue]);

	if (!open) return null;

	const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>): void => {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	};

	const handleConfirm = (): void => {
		onConfirm(value);
	};

	const handleKeyDown = (e: React.KeyboardEvent): void => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleConfirm();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	return (
		<div className="confirm-dialog-overlay" onClick={handleOverlayClick} role="presentation">
			<div
				className="confirm-dialog"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="prompt-dialog-title"
			>
				<div className="confirm-dialog-header">
					<h2 id="prompt-dialog-title">{title}</h2>
					<button className="btn btn-icon" onClick={onCancel} aria-label="Close dialog">
						×
					</button>
				</div>

				<div className="confirm-dialog-content">
					{message && <p className="confirm-dialog-message">{message}</p>}
					<input
						ref={inputRef}
						type="text"
						className="form-input"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder={placeholder}
						onKeyDown={handleKeyDown}
						style={{ width: "100%", marginTop: "8px" }}
					/>
				</div>

				<div className="confirm-dialog-footer">
					<button className="btn" onClick={onCancel}>
						{cancelLabel}
					</button>
					<button className="btn btn-primary" onClick={handleConfirm} disabled={!value}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
