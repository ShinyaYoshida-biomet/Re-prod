import { useCallback, useState } from "react";

interface ConfirmDialogState {
	open: boolean;
	title: string;
	message: string;
	onConfirm: () => void;
}

interface UseConfirmDialogReturn {
	dialogState: ConfirmDialogState;
	showConfirm: (title: string, message: string) => Promise<boolean>;
	handleConfirm: () => void;
	handleCancel: () => void;
}

export function useConfirmDialog(): UseConfirmDialogReturn {
	const [dialogState, setDialogState] = useState<ConfirmDialogState>({
		open: false,
		title: "",
		message: "",
		onConfirm: () => {},
	});

	const showConfirm = useCallback((title: string, message: string): Promise<boolean> => {
		return new Promise((resolve) => {
			setDialogState({
				open: true,
				title,
				message,
				onConfirm: () => {
					setDialogState((prev) => ({ ...prev, open: false }));
					resolve(true);
				},
			});

			// Store the reject callback to call on cancel
			(setDialogState as any)._reject = () => {
				setDialogState((prev) => ({ ...prev, open: false }));
				resolve(false);
			};
		});
	}, []);

	const handleConfirm = useCallback(() => {
		dialogState.onConfirm();
	}, [dialogState]);

	const handleCancel = useCallback(() => {
		setDialogState((prev) => ({ ...prev, open: false }));
		if ((setDialogState as any)._reject) {
			(setDialogState as any)._reject();
			delete (setDialogState as any)._reject;
		}
	}, []);

	return {
		dialogState,
		showConfirm,
		handleConfirm,
		handleCancel,
	};
}
