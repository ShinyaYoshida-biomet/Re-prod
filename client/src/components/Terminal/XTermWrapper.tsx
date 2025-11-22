import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface XTermWrapperProps {
  className?: string;
  autoFocus?: boolean;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onReady?: (terminal: Terminal) => void;
}

export function XTermWrapper({
  className,
  autoFocus = false,
  onInput,
  onResize,
  onReady,
}: XTermWrapperProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      scrollback: 2000,
      fontSize: 13,
      theme: {
        background: '#f6f7fb',
        foreground: '#111827',
        cursor: '#1d4ed8',
        cursorAccent: '#f6f7fb',
        selectionBackground: '#c7d2fe80',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(element);
    fitAddon.fit();
    onResize?.(terminal.cols, terminal.rows);
    // Show a subtle placeholder prompt until the real shell prompt arrives
    terminal.write('\u001b[90mbash-5.2$ \u001b[0m');

    const inputListener = terminal.onData((data) => {
      // Let backend/PTy handle echo to avoid double-echoing and maintain canonical behavior.
      onInput?.(data);
    });

    const handleResize = () => {
      fitAddon.fit();
      onResize?.(terminal.cols, terminal.rows);
    };

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    observer?.observe(element);

    if (autoFocus) {
      terminal.focus();
    }

    termRef.current = terminal;
    onReady?.(terminal);

    return () => {
      inputListener.dispose();
      observer?.disconnect();
      terminal.dispose();
    };
  }, [autoFocus, onInput, onResize, onReady]);

  useEffect(() => {
    if (autoFocus) {
      termRef.current?.focus();
    }
  }, [autoFocus]);

  return <div ref={containerRef} className={className ?? 'terminal-session__canvas'} />;
}
