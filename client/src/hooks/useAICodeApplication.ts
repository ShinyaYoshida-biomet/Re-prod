import { useCallback } from 'react';
import { useStore } from '@/core';
import { applyCodeChangeFile } from '@/services/fileService';
import { REMOTE_FILE_ACTIONS } from '@/core/ai/promptUtils';
import type { AIMessage, CodeBlock } from '@shared/types';

type PostAssistantMessage = (content: string, extras?: Partial<AIMessage>) => void;

export function useAICodeApplication(postAssistantMessage: PostAssistantMessage) {
  const applyCodeChange = useStore((state) => state.applyCodeChange);
  const editorFilepath = useStore((state) => state.editor.filepath);

  const handleApplyCode = useCallback(
    async (codeBlock: CodeBlock): Promise<void> => {
      const targetFile = codeBlock.filepath;

      const isCurrentEditor =
        !targetFile ||
        targetFile === '<current editor buffer>' ||
        targetFile === 'current editor buffer' ||
        targetFile.includes('current_editor_buffer') ||
        targetFile.includes('current editor buffer') ||
        targetFile.startsWith('<') ||
        (!editorFilepath && targetFile);

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
    },
    [applyCodeChange, editorFilepath, postAssistantMessage],
  );

  return { handleApplyCode };
}
