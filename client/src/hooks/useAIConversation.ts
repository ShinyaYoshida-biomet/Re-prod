import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/core';
import { socketService } from '@/services/socket';
import { extractCodeBlocks } from '@/core/ai/codeBlockUtils';
import { applyCodeChangeFile } from '@/services/fileService';
import { buildPromptWithContext, createRequestId, REMOTE_FILE_ACTIONS } from '@/core/ai/promptUtils';
import type { AIMessage, CodeBlock } from '@shared/types';

const STREAM_TIMEOUT_MS = 45000;

export function useAIConversation() {
  const messages = useStore((state) => state.ai.messages);
  const isLoading = useStore((state) => state.ai.isLoading);

  const addAIMessage = useStore((state) => state.addAIMessage);
  const setAILoading = useStore((state) => state.setAILoading);
  const applyCodeChange = useStore((state) => state.applyCodeChange);
  const editorContent = useStore((state) => state.editor.content);
  const editorFilepath = useStore((state) => state.editor.filepath);
  const startStreamingMessage = useStore((state) => state.startStreamingMessage);
  const appendStreamingChunk = useStore((state) => state.appendStreamingChunk);
  const updateStreamingPlan = useStore((state) => state.updateStreamingPlan);
  const recordToolEvent = useStore((state) => state.recordToolEvent);
  const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);

  const [input, setInput] = useState('');
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestRef = useRef<{ id: string; dispose: () => void } | null>(null);

  const clearTimeoutRef = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  const clearActiveRequest = useCallback((options: { dispose?: boolean } = {}) => {
    if (!activeRequestRef.current) {
      return;
    }

    if (options.dispose !== false) {
      activeRequestRef.current.dispose();
    }
    activeRequestRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearTimeoutRef();
      clearActiveRequest();
    };
  }, [clearActiveRequest, clearTimeoutRef]);

  const postAssistantMessage = useCallback(
    (content: string, extras?: Partial<AIMessage>) => {
      const timestamp = Date.now();
      addAIMessage({
        id: timestamp.toString(),
        role: 'assistant',
        content,
        timestamp,
        ...extras,
      });
    },
    [addAIMessage],
  );

  const registerStreamingHandlers = useCallback(
    (requestId: string) => {
      const disposers: Array<() => void> = [];
      let disposed = false;

      const cleanup = (): void => {
        if (disposed) {
          return;
        }
        disposed = true;
        disposers.forEach((dispose) => {
          try {
            dispose();
          } catch (error) {
            console.error('Failed to cleanup WebSocket listener', error);
          }
        });
      };

      const finalize = (finalContent: string, extras?: { codeBlocks?: CodeBlock[] }) => {
        completeStreamingMessage(requestId, finalContent, extras);
        setAILoading(false);
        clearTimeoutRef();
        cleanup();
        if (activeRequestRef.current?.id === requestId) {
          clearActiveRequest({ dispose: false });
        }
      };

      disposers.push(
        socketService.on('ai_response_chunk', (message) => {
          if (message.type !== 'ai_response_chunk' || message.id !== requestId) {
            return;
          }
          clearTimeoutRef();
          appendStreamingChunk(requestId, message.chunk);
        }),
      );

      disposers.push(
        socketService.on('ai_plan_updated', (message) => {
          if (message.type !== 'ai_plan_updated' || message.id !== requestId) {
            return;
          }
          updateStreamingPlan(requestId, message.plan);
        }),
      );

      disposers.push(
        socketService.on('ai_tool_started', (message) => {
          if (message.type !== 'ai_tool_started' || message.id !== requestId) {
            return;
          }
          recordToolEvent(requestId, message.tool);
        }),
      );

      disposers.push(
        socketService.on('ai_tool_finished', (message) => {
          if (message.type !== 'ai_tool_finished' || message.id !== requestId) {
            return;
          }
          recordToolEvent(requestId, message.tool);
        }),
      );

      disposers.push(
        socketService.on('ai_response_complete', (message) => {
          if (message.type !== 'ai_response_complete' || message.id !== requestId) {
            return;
          }
          const codeBlocks = message.codeBlocks ?? extractCodeBlocks(message.final);
          finalize(message.final, { codeBlocks });
        }),
      );

      disposers.push(
        socketService.on('ai_response', (message) => {
          if (message.type !== 'ai_response') {
            return;
          }
          if (activeRequestRef.current?.id !== requestId) {
            return;
          }
          const codeBlocks = extractCodeBlocks(message.response);
          finalize(message.response, { codeBlocks });
        }),
      );

      disposers.push(
        socketService.on('ai_response_with_tools', (message) => {
          if (message.type !== 'ai_response_with_tools') {
            return;
          }
          if (activeRequestRef.current?.id !== requestId) {
            return;
          }

          let content: string | undefined;
          if (typeof message.response === 'string') {
            content = message.response;
          } else if (typeof message.response.content === 'string' && message.response.content.length) {
            content = message.response.content;
          } else if (Array.isArray(message.response.tool_calls) && message.response.tool_calls.length > 0) {
            content = message.response.tool_calls
              .map((call, index) => `${index + 1}. ${call.name}\nInput: ${JSON.stringify(call.input)}`)
              .join('\n\n');
          }

          const codeBlocks = extractCodeBlocks(content ?? '');
          finalize(content ?? 'AI response received (no content)', {
            codeBlocks,
          });
        }),
      );

      disposers.push(
        socketService.on('error', (message) => {
          if (message.type !== 'error') {
            return;
          }
          if (activeRequestRef.current?.id !== requestId) {
            return;
          }
          finalize(`AI request failed: ${message.message}`);
        }),
      );

      return cleanup;
    },
    [appendStreamingChunk, clearActiveRequest, clearTimeoutRef, completeStreamingMessage, recordToolEvent, setAILoading, updateStreamingPlan],
  );

  const handleApplyCode = useCallback(async (codeBlock: CodeBlock): Promise<void> => {
    const targetFile = codeBlock.filepath;

    // Treat placeholders and temporary names as current editor
    const isCurrentEditor = !targetFile ||
                           targetFile === '<current editor buffer>' ||
                           targetFile === 'current editor buffer' ||
                           targetFile.includes('current_editor_buffer') ||
                           targetFile.includes('current editor buffer') ||
                           targetFile.startsWith('<') ||
                           (!editorFilepath && targetFile); // If no file is open, treat any target as current editor

    const shouldUseRemote =
      Boolean(targetFile) &&
      !isCurrentEditor &&
      targetFile !== editorFilepath &&
      REMOTE_FILE_ACTIONS.has(codeBlock.action);

    if (shouldUseRemote) {
      try {
        await applyCodeChangeFile(codeBlock);
        postAssistantMessage(`Applied ${codeBlock.action} to ${targetFile}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        postAssistantMessage(`Failed to apply remote change: ${message}`);
        console.error('Remote code change failed', error);
      }
      return;
    }

    if (applyCodeChange) {
      await applyCodeChange(codeBlock);
      return;
    }

    console.warn('applyCodeChange not available, falling back to append mode');
  }, [applyCodeChange, editorFilepath, postAssistantMessage]);

  const handleStop = useCallback((): void => {
    clearTimeoutRef();
    setAILoading(false);
    const streamingId = activeRequestRef.current?.id;
    if (streamingId) {
      completeStreamingMessage(streamingId);
      clearActiveRequest();
    } else {
      postAssistantMessage('Request stopped by user.');
    }
  }, [clearActiveRequest, clearTimeoutRef, completeStreamingMessage, postAssistantMessage, setAILoading]);

  const handleAsk = useCallback((): void => {
    if (!input.trim()) {
      return;
    }

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    const requestMessages = [
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: 'user' as const, content: buildPromptWithContext(editorFilepath, editorContent, input) },
    ];

    const requestId = createRequestId();

    addAIMessage(userMessage);
    startStreamingMessage(requestId);
    setAILoading(true);
    setInput('');

    clearTimeoutRef();
    timeoutIdRef.current = setTimeout(() => {
      completeStreamingMessage(requestId, 'Request timed out. The AI service took too long to respond. Please try again.');
      setAILoading(false);
      clearActiveRequest();
    }, STREAM_TIMEOUT_MS);

    const cleanup = registerStreamingHandlers(requestId);

    const sent = socketService.send({
      type: 'ai_message',
      request_id: requestId,
      stream: true,
      messages: requestMessages,
      enable_tools: true,
    });

    if (!sent) {
      cleanup();
      clearTimeoutRef();
      completeStreamingMessage(requestId, 'AI request failed: not connected to backend service.');
      setAILoading(false);
      return;
    }

    clearActiveRequest();
    activeRequestRef.current = {
      id: requestId,
      dispose: cleanup,
    };
  }, [
    addAIMessage,
    clearActiveRequest,
    clearTimeoutRef,
    completeStreamingMessage,
    editorContent,
    editorFilepath,
    input,
    messages,
    registerStreamingHandlers,
    setAILoading,
    startStreamingMessage,
  ]);

  return {
    input,
    setInput,
    messages,
    isLoading,
    handleAsk,
    handleStop,
    handleApplyCode,
  };
}
