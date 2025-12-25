/**
 * Represents the state of an async operation.
 * @template T The type of the data being loaded
 */
export interface AsyncState<T> {
	/** The loaded data, or null if not yet loaded */
	data: T | null;
	/** Whether an async operation is in progress */
	loading: boolean;
	/** Error message if the operation failed, or null if successful */
	error: string | null;
}

/**
 * Action types for the async state reducer.
 * @template T The type of the data being loaded
 */
export type AsyncStateAction<T> =
	| { type: "loading" }
	| { type: "success"; payload: T }
	| { type: "error"; payload: string }
	| { type: "reset" }
	| { type: "set-data"; payload: T | null };

/**
 * Initial state for async operations.
 */
export const asyncStateInitial: AsyncState<unknown> = {
	data: null,
	loading: false,
	error: null,
};

/**
 * Reducer function for async state management.
 * @template T The type of the data being loaded
 */
export function asyncStateReducer<T>(
	state: AsyncState<T>,
	action: AsyncStateAction<T>,
): AsyncState<T> {
	switch (action.type) {
		case "loading":
			return { ...state, loading: true, error: null };
		case "success":
			return { data: action.payload, loading: false, error: null };
		case "error":
			return { ...state, loading: false, error: action.payload };
		case "reset":
			return { data: null, loading: false, error: null };
		case "set-data":
			return { ...state, data: action.payload };
		default:
			return state;
	}
}
