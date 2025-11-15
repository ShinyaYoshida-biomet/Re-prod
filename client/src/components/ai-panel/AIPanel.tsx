import { useRef, useEffect, useState } from 'react';
import type { AIMode } from '@shared/types';
import { IconSend, IconSquare } from '@/components/shared';
import { StreamingMessage } from './StreamingMessage';
import { useAIConversation } from '@/hooks/useAIConversation';

export function AIPanel(): JSX.Element {
  const {
    input,
    setInput,
    messages,
    isLoading,
    handleAsk,
    handleStop,
    handleApplyCode,
  } = useAIConversation();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [mode, setMode] = useState<AIMode>('agent');
  const placeholder = mode === 'agent' ? 'Describe a task...' : 'Ask a question...';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      handleAsk(mode);
    }
  };

  return (
    <div className="panel ai-panel">
      <div className="panel-header">
        <div className="panel-title">AI Assistant</div>
      </div>
      <div className="panel-content">
        <div className="ai-messages">
          {messages.length === 0 ? (
            <div className="ai-welcome">
              <h3>AI Assistant</h3>
              <p>Ask me anything about R programming, data analysis, or visualization.</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                message.role === 'assistant' ? (
                  <StreamingMessage
                    key={message.id}
                    message={message}
                    onApplyCode={handleApplyCode}
                  />
                ) : (
                  <div key={message.id} className="message message-user">
                    <div className="message-header">
                      <span className="message-role">You</span>
                    </div>
                    <div className="message-content">
                      {message.content}
                    </div>
                  </div>
                )
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        <div className="ai-input-container">
          <div className="prompt-input-container">
            <textarea
              className="ai-input"
              placeholder={placeholder}
              aria-label={placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={3}
            />
            <div className="prompt-actions">
              <div className="ai-mode-selector" role="group" aria-label="AI interaction mode">
                <button
                  type="button"
                  className={mode === 'agent' ? 'active' : ''}
                  onClick={() => setMode('agent')}
                >
                  Agent
                </button>
                <button
                  type="button"
                  className={mode === 'chat' ? 'active' : ''}
                  onClick={() => setMode('chat')}
                >
                  Chat
                </button>
              </div>
              <button
                type="button"
                className="send-icon-button"
                onClick={() => handleAsk(mode)}
                disabled={!input.trim() || isLoading}
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <IconSend width={16} height={16} aria-hidden />
              </button>
            </div>
          </div>
          {isLoading && (
            <button
              className="btn btn-stop"
              onClick={handleStop}
              title="Stop generation"
            >
              <>
                <IconSquare width={16} height={16} aria-hidden />
                Stop
              </>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
