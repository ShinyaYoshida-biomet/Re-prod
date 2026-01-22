import { useCallback, useRef } from "react";

export function useTimeoutEffect() {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearTimeoutRef = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const startTimeout = useCallback(
		(callback: () => void, ms: number) => {
			clearTimeoutRef();
			timeoutRef.current = setTimeout(callback, ms);
		},
		[clearTimeoutRef],
	);

	return { startTimeout, clearTimeoutRef };
}
