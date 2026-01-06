import { useCallback, useRef, useState } from "react";

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
	const rejectRef = useRef<(() => void) | null>(null);

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
			rejectRef.current = () => {
				setDialogState((prev) => ({ ...prev, open: false }));
				resolve(false);
			};
		});
	}, []);

	const handleConfirm = useCallback(() => {
		setDialogState((prev) => ({ ...prev, open: false }));
		rejectRef.current = null;
	}, []);

	const handleCancel = useCallback(() => {
		setDialogState((prev) => ({ ...prev, open: false }));
		if (rejectRef.current) {
			rejectRef.current();
			rejectRef.current = null;
		}
	}, []);

	return {
		dialogState,
		showConfirm,
		handleConfirm,
		handleCancel,
	};
}
