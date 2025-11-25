/**
 * Lightweight error notification utility.
 *
 * Creates a single DOM container that displays dismissible notifications
 * so users can actually see when something goes wrong.
 */

type NotifyOptions = {
	description?: string;
	error?: unknown;
	actionLabel?: string;
	onAction?: () => void;
	duration?: number;
	persist?: boolean;
};

const DEFAULT_DURATION = 6000;
const CONTAINER_ID = "app-error-notifications";
const STYLE_ID = "app-error-notification-styles";

const styles = `
  #${CONTAINER_ID} {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(320px, calc(100vw - 2rem));
    pointer-events: none;
  }
  .error-notification {
    pointer-events: auto;
    background: #1f2937;
    color: #f9fafb;
    border-left: 4px solid #f87171;
    border-radius: 6px;
    padding: 0.85rem 1rem 0.85rem 0.95rem;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.35);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    animation: error-notification-slide-in 160ms ease-out;
  }
  .error-notification__title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }
  .error-notification__description {
    font-size: 0.85rem;
    color: #e5e7eb;
    line-height: 1.3;
  }
  .error-notification__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  .error-notification__button {
    border: none;
    border-radius: 4px;
    padding: 0.35rem 0.6rem;
    background: rgba(248, 113, 113, 0.15);
    color: #fecaca;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease;
  }
  .error-notification__button:hover {
    background: rgba(248, 113, 113, 0.3);
  }
  .error-notification__close {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    background: transparent;
    color: #9ca3af;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.2rem;
    line-height: 1;
  }
  .error-notification--leaving {
    animation: error-notification-leave 180ms ease-in forwards;
  }
  @keyframes error-notification-slide-in {
    from {
      opacity: 0;
      transform: translateY(-8px) translateX(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0) translateX(0);
    }
  }
  @keyframes error-notification-leave {
    to {
      opacity: 0;
      transform: translateY(-8px);
    }
  }
`;

export class ErrorHandler {
	private static styleInjected = false;

	static notify(message: string, options: NotifyOptions = {}): void {
		if (typeof document === "undefined") {
			ErrorHandler.logToConsole(message, options.error);
			return;
		}

		ErrorHandler.injectStyles();
		const container = ErrorHandler.ensureContainer();
		const notification = document.createElement("div");
		notification.className = "error-notification";
		notification.setAttribute("role", "alert");
		notification.setAttribute("aria-live", "assertive");
		notification.style.position = "relative";

		const title = document.createElement("p");
		title.className = "error-notification__title";
		title.textContent = message;
		notification.appendChild(title);

		const description = options.description ?? ErrorHandler.describe(options.error);
		if (description) {
			const descriptionEl = document.createElement("p");
			descriptionEl.className = "error-notification__description";
			descriptionEl.textContent = description;
			notification.appendChild(descriptionEl);
		}

		if (options.actionLabel && options.onAction) {
			const actions = document.createElement("div");
			actions.className = "error-notification__actions";
			const button = document.createElement("button");
			button.type = "button";
			button.className = "error-notification__button";
			button.textContent = options.actionLabel;
			button.addEventListener("click", () => {
				options.onAction?.();
				ErrorHandler.dismiss(notification);
			});
			actions.appendChild(button);
			notification.appendChild(actions);
		}

		const close = document.createElement("button");
		close.type = "button";
		close.className = "error-notification__close";
		close.setAttribute("aria-label", "Dismiss notification");
		close.textContent = "\u00d7";
		close.addEventListener("click", () => ErrorHandler.dismiss(notification));
		notification.appendChild(close);

		container.appendChild(notification);

		if (!options.persist) {
			const duration = options.duration ?? DEFAULT_DURATION;
			window.setTimeout(() => ErrorHandler.dismiss(notification), duration);
		}

		ErrorHandler.logToConsole(message, options.error);
	}

	private static ensureContainer(): HTMLDivElement {
		const existing = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
		if (existing) {
			return existing;
		}
		const container = document.createElement("div");
		container.id = CONTAINER_ID;
		container.setAttribute("aria-live", "assertive");
		container.setAttribute("aria-atomic", "true");
		document.body.appendChild(container);
		return container;
	}

	private static injectStyles(): void {
		if (ErrorHandler.styleInjected || typeof document === "undefined") {
			return;
		}
		if (document.getElementById(STYLE_ID)) {
			ErrorHandler.styleInjected = true;
			return;
		}
		const styleEl = document.createElement("style");
		styleEl.id = STYLE_ID;
		styleEl.textContent = styles;
		document.head.appendChild(styleEl);
		ErrorHandler.styleInjected = true;
	}

	private static describe(error: unknown): string | undefined {
		if (!error) {
			return undefined;
		}

		if (typeof error === "string") {
			return error;
		}

		if (error instanceof Error) {
			return error.message;
		}

		try {
			return JSON.stringify(error);
		} catch {
			return undefined;
		}
	}

	private static dismiss(element: HTMLElement): void {
		element.classList.add("error-notification--leaving");
		window.setTimeout(() => {
			element.remove();
		}, 180);
	}

	private static logToConsole(message: string, error?: unknown): void {
		if (error) {
			console.error(message, error);
		} else {
			console.error(message);
		}
	}
}

export default ErrorHandler;
