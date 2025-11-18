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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

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
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(element);
    fitAddon.fit();
    onResize?.(terminal.cols, terminal.rows);

    const inputListener = terminal.onData((data) => onInput?.(data));

    const handleResize = () => {
      fitAddon.fit();
      onResize?.(terminal.cols, terminal.rows);
    };

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResize)
        : null;

    if (observer) {
      observer.observe(element);
      resizeObserverRef.current = observer;
    }

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
