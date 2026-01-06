import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncState } from "../useAsyncState";

describe("useAsyncState", () => {
	describe("initial state", () => {
		it("should have correct initial state", () => {
			const asyncFn = vi.fn().mockResolvedValue("data");
			const { result } = renderHook(() => useAsyncState(asyncFn));

			expect(result.current.data).toBeNull();
			expect(result.current.loading).toBe(false);
			expect(result.current.error).toBeNull();
		});

		it("should use initialData when provided", () => {
			const asyncFn = vi.fn().mockResolvedValue("new data");
			const { result } = renderHook(() => useAsyncState(asyncFn, { initialData: "initial data" }));

			expect(result.current.data).toBe("initial data");
		});
	});

	describe("execute", () => {
		it("should set data on successful execution", async () => {
			const asyncFn = vi.fn().mockResolvedValue("success data");
			const { result } = renderHook(() => useAsyncState(asyncFn));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(result.current.data).toBe("success data");
			});

			expect(result.current.loading).toBe(false);
			expect(result.current.error).toBeNull();
		});

		it("should set error on failed execution", async () => {
			const asyncFn = vi.fn().mockRejectedValue(new Error("Test error"));
			const { result } = renderHook(() => useAsyncState(asyncFn));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(result.current.error).toBe("Test error");
			});

			expect(result.current.data).toBeNull();
			expect(result.current.loading).toBe(false);
		});

		it("should handle non-Error throws", async () => {
			const asyncFn = vi.fn().mockRejectedValue("string error");
			const { result } = renderHook(() => useAsyncState(asyncFn));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(result.current.error).toBe("string error");
			});
		});
	});

	describe("immediate option", () => {
		it("should execute immediately when immediate is true", async () => {
			const asyncFn = vi.fn().mockResolvedValue("immediate data");

			const { result } = renderHook(() => useAsyncState(asyncFn, { immediate: true }));

			await waitFor(() => {
				expect(result.current.data).toBe("immediate data");
			});

			expect(asyncFn).toHaveBeenCalledTimes(1);
		});

		it("should not execute immediately when immediate is false", () => {
			const asyncFn = vi.fn().mockResolvedValue("data");

			renderHook(() => useAsyncState(asyncFn, { immediate: false }));

			expect(asyncFn).not.toHaveBeenCalled();
		});
	});

	describe("callbacks", () => {
		it("should call onSuccess callback on successful execution", async () => {
			const onSuccess = vi.fn();
			const asyncFn = vi.fn().mockResolvedValue("success data");

			const { result } = renderHook(() => useAsyncState(asyncFn, { onSuccess }));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(onSuccess).toHaveBeenCalledWith("success data");
			});
		});

		it("should call onError callback on failed execution", async () => {
			const onError = vi.fn();
			const asyncFn = vi.fn().mockRejectedValue(new Error("Test error"));

			const { result } = renderHook(() => useAsyncState(asyncFn, { onError }));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(onError).toHaveBeenCalledWith(expect.any(Error));
			});
		});
	});

	describe("reset", () => {
		it("should reset state to initial values", async () => {
			const asyncFn = vi.fn().mockResolvedValue("data");
			const { result } = renderHook(() => useAsyncState(asyncFn));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(result.current.data).toBe("data");
			});

			act(() => {
				result.current.reset();
			});

			expect(result.current.data).toBeNull();
			expect(result.current.loading).toBe(false);
			expect(result.current.error).toBeNull();
		});
	});

	describe("setData", () => {
		it("should manually set data", () => {
			const asyncFn = vi.fn().mockResolvedValue("async data");
			const { result } = renderHook(() => useAsyncState(asyncFn));

			act(() => {
				result.current.setData("manual data");
			});

			expect(result.current.data).toBe("manual data");
		});

		it("should allow setting data to null", async () => {
			const asyncFn = vi.fn().mockResolvedValue("data");
			const { result } = renderHook(() => useAsyncState(asyncFn));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(result.current.data).toBe("data");
			});

			act(() => {
				result.current.setData(null);
			});

			expect(result.current.data).toBeNull();
		});
	});

	describe("typed data", () => {
		interface User {
			id: number;
			name: string;
		}

		it("should work with typed data", async () => {
			const user: User = { id: 1, name: "John" };
			const asyncFn = vi.fn().mockResolvedValue(user);

			const { result } = renderHook(() => useAsyncState<User>(asyncFn));

			await act(async () => {
				await result.current.execute();
			});

			await waitFor(() => {
				expect(result.current.data).toEqual({ id: 1, name: "John" });
			});

			expect(result.current.data?.name).toBe("John");
		});
	});
});
