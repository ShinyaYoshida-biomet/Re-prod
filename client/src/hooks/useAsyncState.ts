import { useCallback, useEffect, useReducer, useRef } from "react";
import type { AsyncState, AsyncStateAction } from "@/types/asyncState";
import { asyncStateReducer } from "@/types/asyncState";

/**
 * Options for configuring the useAsyncState hook.
 * @template T The type of the data being loaded
 */
export interface UseAsyncStateOptions<T> {
	/**
	 * Whether to execute the async function immediately on mount.
	 * @default false
	 */
	immediate?: boolean;

	/**
	 * Callback invoked when the async operation succeeds.
	 */
	onSuccess?: (data: T) => void;

	/**
	 * Callback invoked when the async operation fails.
	 */
	onError?: (error: Error) => void;

	/**
	 * Initial data to use before the async function is executed.
	 */
	initialData?: T | null;
}

/**
 * Return type for the useAsyncState hook.
 * @template T The type of the data being loaded
 */
export interface UseAsyncStateReturn<T> extends AsyncState<T> {
	/**
	 * Execute the async function.
	 * Returns a promise that resolves when the operation completes.
	 */
	execute: () => Promise<void>;

	/**
	 * Reset the state to initial values.
	 */
	reset: () => void;

	/**
	 * Manually set the data.
	 */
	setData: (data: T | null) => void;
}

/**
 * A hook for managing async state with loading, error, and data states.
 *
 * Handles the common pattern of:
 * 1. Setting loading to true
 * 2. Executing an async function
 * 3. Setting data on success or error on failure
 * 4. Setting loading to false
 *
 * @example
 * ```tsx
 * const { data, loading, error, execute } = useAsyncState(
 *   async () => {
 *     const response = await fetch('/api/data');
 *     return response.json();
 *   },
 *   { immediate: true }
 * );
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error} />;
 * return <DataDisplay data={data} />;
 * ```
 *
 * @template T The type of the data being loaded
 * @param asyncFn The async function to execute
 * @param options Configuration options
 */
export function useAsyncState<T>(
	asyncFn: () => Promise<T>,
	options: UseAsyncStateOptions<T> = {},
): UseAsyncStateReturn<T> {
	const { immediate = false, onSuccess, onError, initialData = null } = options;

	const [state, dispatch] = useReducer(asyncStateReducer<T>, {
		data: initialData,
		loading: false,
		error: null,
	});

	// Track if the component is mounted to avoid state updates after unmount
	const mountedRef = useRef(true);

	// Keep the latest callbacks in refs to avoid dependency issues
	const asyncFnRef = useRef(asyncFn);
	const onSuccessRef = useRef(onSuccess);
	const onErrorRef = useRef(onError);

	// Update refs when values change
	asyncFnRef.current = asyncFn;
	onSuccessRef.current = onSuccess;
	onErrorRef.current = onError;

	useEffect(() => {
		return () => {
			mountedRef.current = false;
		};
	}, []);

	const execute = useCallback(async (): Promise<void> => {
		dispatch({ type: "loading" } as AsyncStateAction<T>);

		try {
			const result = await asyncFnRef.current();

			if (mountedRef.current) {
				dispatch({ type: "success", payload: result } as AsyncStateAction<T>);
				onSuccessRef.current?.(result);
			}
		} catch (err) {
			if (mountedRef.current) {
				const error = err instanceof Error ? err : new Error(String(err));
				dispatch({ type: "error", payload: error.message } as AsyncStateAction<T>);
				onErrorRef.current?.(error);
			}
		}
	}, []);

	const reset = useCallback(() => {
		dispatch({ type: "reset" } as AsyncStateAction<T>);
	}, []);

	const setData = useCallback((data: T | null) => {
		dispatch({ type: "set-data", payload: data } as AsyncStateAction<T>);
	}, []);

	// Execute immediately if requested
	useEffect(() => {
		if (immediate) {
			void execute();
		}
	}, [immediate, execute]);

	return {
		data: state.data,
		loading: state.loading,
		error: state.error,
		execute,
		reset,
		setData,
	};
}
