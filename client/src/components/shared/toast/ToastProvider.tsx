import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Toast, type ToastProps, type ToastSeverity } from "./Toast";
import { registerToastFunction, unregisterToastFunction } from "@/services/toastService";

interface ToastOptions {
	duration?: number;
}

export interface ToastContextValue {
	showToast: (message: string, severity: ToastSeverity, options?: ToastOptions) => void;
	showInfo: (message: string, options?: ToastOptions) => void;
	showSuccess: (message: string, options?: ToastOptions) => void;
	showWarning: (message: string, options?: ToastOptions) => void;
	showError: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastData extends Omit<ToastProps, "onDismiss"> {}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<ToastData[]>([]);

	const dismissToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	const showToast = useCallback(
		(message: string, severity: ToastSeverity, options?: ToastOptions) => {
			const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
			const newToast: ToastData = {
				id,
				message,
				severity,
				duration: options?.duration ?? 4000,
			};
			setToasts((prev) => [...prev, newToast]);
		},
		[],
	);

	const showInfo = useCallback(
		(message: string, options?: ToastOptions) => {
			showToast(message, "info", options);
		},
		[showToast],
	);

	const showSuccess = useCallback(
		(message: string, options?: ToastOptions) => {
			showToast(message, "success", options);
		},
		[showToast],
	);

	const showWarning = useCallback(
		(message: string, options?: ToastOptions) => {
			showToast(message, "warning", options);
		},
		[showToast],
	);

	const showError = useCallback(
		(message: string, options?: ToastOptions) => {
			showToast(message, "error", options);
		},
		[showToast],
	);

	const value: ToastContextValue = {
		showToast,
		showInfo,
		showSuccess,
		showWarning,
		showError,
	};

	// Register toast function for non-React contexts
	useEffect(() => {
		registerToastFunction(showToast);
		return () => {
			unregisterToastFunction();
		};
	}, [showToast]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<div className="toast-container" aria-live="polite" aria-atomic="false">
				{toasts.map((toast) => (
					<Toast key={toast.id} {...toast} onDismiss={dismissToast} />
				))}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast must be used within ToastProvider");
	}
	return context;
}
