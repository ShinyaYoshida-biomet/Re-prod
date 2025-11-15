import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/core';
import { socketService } from '@/services/socket';
import { buildPromptWithContext, createRequestId } from '@/core/ai/promptUtils';
import type { AIMessage, AIMode } from '@shared/types';
import { useAIStreaming } from './useAIStreaming';
import { useAICodeApplication } from './useAICodeApplication';
import { useAITimeout } from './useAITimeout';

const STREAM_TIMEOUT_MS = 45000;

export function useAIConversation() {
  const messages = useStore((state) => state.ai.messages);
  const isLoading = useStore((state) => state.ai.isLoading);

  const addAIMessage = useStore((state) => state.addAIMessage);
  const startStreamingMessage = useStore((state) => state.startStreamingMessage);
  const setAILoading = useStore((state) => state.setAILoading);
  const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
  const editorContent = useStore((state) => state.editor.content);
  const editorFilepath = useStore((state) => state.editor.filepath);

  const { clearTimeoutRef, startTimeout } = useAITimeout();
  const { registerStreamingHandlers } = useAIStreaming();

  const [input, setInput] = useState('');
  const activeRequestRef = useRef<{ id: string; dispose: () => void } | null>(null);

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

  const { handleApplyCode } = useAICodeApplication(postAssistantMessage);

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

  const handleStop = useCallback(() => {
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

  const handleAsk = useCallback(
    (mode: AIMode = 'agent') => {
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

      startTimeout(() => {
        completeStreamingMessage(requestId, 'Request timed out. The AI service took too long to respond. Please try again.');
        setAILoading(false);
        clearActiveRequest();
      }, STREAM_TIMEOUT_MS);

      const cleanup = registerStreamingHandlers(requestId, {
        isRequestActive: () => activeRequestRef.current?.id === requestId,
        onComplete: () => {
          clearTimeoutRef();
          clearActiveRequest({ dispose: false });
        },
        onStreamingProgress: clearTimeoutRef,
      });

      const enableTools = mode === 'agent';

      const sent = socketService.send({
        type: 'ai_message',
        request_id: requestId,
        stream: true,
        messages: requestMessages,
        enable_tools: enableTools,
        mode,
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
    },
    [
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
      startTimeout,
    ],
  );

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
