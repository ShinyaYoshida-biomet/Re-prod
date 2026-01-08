import { ConfirmDialog } from "@/components/shared";

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
}: UnsavedChangesDialogProps): JSX.Element {
	return (
		<ConfirmDialog
			open={open}
			title={`Save changes to "${filename}"?`}
			message="Your changes will be lost if you don't save them."
			onClose={onCancel}
		>
			<div className="dialog-actions">
				<button type="button" className="btn btn-secondary" onClick={onDontSave}>
					Don't Save
				</button>
				<button type="button" className="btn btn-secondary" onClick={onCancel}>
					Cancel
				</button>
				<button type="button" className="btn btn-primary" onClick={onSave}>
					Save
				</button>
			</div>
		</ConfirmDialog>
	);
}
