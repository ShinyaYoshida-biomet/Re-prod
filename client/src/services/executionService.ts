import type { ExecutionRequestPayload, ExecutionResultPayload, ServerMessage, ClientMessage } from '@shared/types';
import { socketService } from './socket';

export class ExecutionServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExecutionServiceError';
  }
}

// Observer pattern for state updates
type ExecutionStateChangeListener = (state: ExecutionState) => void;

/**
 * Defines the current state of an R execution.
 */
export interface ExecutionState {
  status: 'idle' | 'executing' | 'completed' | 'error' | 'cancelled';
  output: string; // The accumulated or final output of the execution
  error?: string; // Error message if status is 'error'
}

/**
 * `ExecutionService` is responsible for managing R code execution.
 * It encapsulates the business logic for sending execution requests via WebSocket,
 * handling responses, managing the execution state, and providing a mechanism
 * for components to subscribe to state changes and cancel ongoing executions.
 */
class ExecutionService {
  private static readonly INITIAL_STATE: ExecutionState = {
    status: 'idle',
    output: '',
    error: undefined,
  };

  private currentState: ExecutionState = ExecutionService.INITIAL_STATE;
  private listeners: Set<ExecutionStateChangeListener> = new Set();
  private abortController: AbortController | null = null;
  private currentExecutionPromise: Promise<ExecutionResultPayload> | null = null;

  private updateState(newState: Partial<ExecutionState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.currentState));
  }

  subscribe(listener: ExecutionStateChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => this.unsubscribe(listener);
  }

  unsubscribe(listener: ExecutionStateChangeListener) {
    this.listeners.delete(listener);
  }

  executeCode(code: string): Promise<ExecutionResultPayload> {
    if (this.currentExecutionPromise) {
      return Promise.reject(
        new ExecutionServiceError('Another R execution is already in progress. Please wait or cancel it.')
      );
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    this.updateState({ ...ExecutionService.INITIAL_STATE, status: 'executing' });

    const requestPayload: ExecutionRequestPayload = { code };

    this.currentExecutionPromise = new Promise<ExecutionResultPayload>((resolve, reject) => {
      const matcher = (message: ServerMessage): boolean =>
        message.type === 'execution_result' || message.type === 'error';

      const handleAbort = () => {
        if (this.currentState.status === 'executing') {
          this.updateState({ status: 'cancelled', error: 'Execution cancelled by user.' });
        }
        reject(new ExecutionServiceError('Execution was cancelled.'));
      };

      signal.addEventListener('abort', handleAbort, { once: true });

      const didSend = socketService.send(
        { type: 'execute', request: requestPayload } as ClientMessage,
        (message) => {
          if (signal.aborted) return;

          if (message.type === 'execution_result') {
            this.updateState({ status: 'completed', output: message.result.output, error: undefined });
            resolve(message.result);
          } else if (message.type === 'error') {
            this.updateState({
              status: 'error',
              output: (message.details as any)?.output || '',
              error: message.message,
            });
            reject(new ExecutionServiceError(message.message));
          } else {
            const errorMessage = `Unexpected execution response: ${message.type}`;
            this.updateState({ status: 'error', output: '', error: errorMessage });
            reject(new ExecutionServiceError(errorMessage));
          }
        },
        matcher
      );

      if (!didSend) {
        const errorMessage = 'WebSocket is not connected.';
        this.updateState({ status: 'error', output: '', error: errorMessage });
        reject(new ExecutionServiceError(errorMessage));
      }
    }).finally(() => {
      this.currentExecutionPromise = null;
      this.abortController = null;
    });

    return this.currentExecutionPromise;
  }

  cancelExecution(): void {
    if (this.currentState.status !== 'executing' || !this.abortController) {
      return;
    }

    this.abortController.abort();

    const didSendCancel = socketService.send(
      { type: 'cancel_execution' } as ClientMessage,
      () => {}, // No specific response expected
    );
    if (!didSendCancel) {
      console.warn('ExecutionService: Failed to send cancellation request: WebSocket not connected.');
    }
  }

  getCurrentState(): ExecutionState {
    return this.currentState;
  }
}

// Export a singleton instance of the ExecutionService
export const executionService = new ExecutionService();