/**
 * @module message-composer
 * Primary text input for sending messages. Features a growing textarea, pending
 * attachments strip, slash-command palette, paste-to-upload, typing-event
 * debouncing via the gateway, and AI slash-command dispatch with streaming.
 */
'use client';

import { useState, useCallback, useRef, useImperativeHandle, forwardRef, type KeyboardEvent, type FormEvent, type ClipboardEvent } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { useMessageStore, type Message } from '../../stores/message-store';
import { sendMessage } from '../../lib/hub-api';
import { gateway } from '../../lib/gateway-client';
import { FileUploadButton, type FileUploadHandle } from './file-upload-button';
import { CommandPalette } from './command-palette';
import { useAIStore } from '../../stores/ai-store';
import { getAIConfig } from '../../lib/ai/ai-client';
import { OpenAIClient } from '../../lib/ai/openai-client';
import { AnthropicClient } from '../../lib/ai/anthropic-client';
import { buildSummarizePrompt, buildCatchUpPrompt, buildDraftPrompt } from '../../lib/ai/prompt-builder';
import type { SlashCommand } from '../../lib/ai/commands';

const EMPTY_MESSAGES: Message[] = [];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingAttachment {
  attachmentId: string;
  fileName: string;
  fileSize: number;
  fileNameEncrypted: string;
  encryptionKeyId: string;
  nonce: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageComposerProps {
  channelId: string;
  channelName: string;
}

/** Imperative handle exposed to parent (e.g. ChatArea for drag-and-drop). */
export interface MessageComposerHandle {
  uploadFile: (file: File) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decryptFileName(encrypted: string): string {
  try {
    return decodeURIComponent(escape(atob(encrypted)));
  } catch {
    return 'file';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(
function MessageComposer({ channelId, channelName }, ref) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const userId = useAuthStore((s) => s.userId);
  const handle = useAuthStore((s) => s.handle);
  const deviceId = useAuthStore((s) => s.deviceId);
  const addMessage = useMessageStore((s) => s.addMessage);
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const startResponse = useAIStore((s) => s.startResponse);
  const appendResponse = useAIStore((s) => s.appendResponse);
  const setAIError = useAIStore((s) => s.setError);
  const aiProcessing = useAIStore((s) => s.isProcessing);

  const fileUploadRef = useRef<FileUploadHandle>(null);

  // Expose uploadFile to parent (ChatArea drag-and-drop handler)
  useImperativeHandle(ref, () => ({
    uploadFile: (file: File) => fileUploadRef.current?.uploadFile(file),
  }), []);

  const lastTypingSent = useRef(0);
  const TYPING_DEBOUNCE_MS = 3_000;

  const hasPendingAttachments = pendingAttachments.length > 0;

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current > TYPING_DEBOUNCE_MS) {
      lastTypingSent.current = now;
      // TYPING_START = opcode 20
      gateway.send(20, { channelId, handle: handle ?? undefined });
    }
  }, [channelId, handle]);

  const handleCommandSelect = useCallback(async (cmd: SlashCommand) => {
    setShowPalette(false);

    const config = getAIConfig();
    if (!config) {
      startResponse(channelId);
      setAIError('No AI provider configured. Open AI Settings to set up your API key.');
      return;
    }

    // For /draft, extract the argument
    if (cmd.takesArgument) {
      const arg = content.replace(`/${cmd.name}`, '').trim();
      if (!arg) {
        setContent(`/${cmd.name} `);
        return; // Wait for argument
      }
    }

    const fullInput = content.replace(`/${cmd.name}`, '').trim();
    setContent('');

    // Build client
    let client;
    if (config.provider === 'anthropic') {
      client = new AnthropicClient(config.apiKey, config.model);
    } else {
      client = new OpenAIClient(config.apiKey, config.model, config.baseUrl);
    }

    // Build prompt
    let prompt: string;
    let system: string;
    if (cmd.name === 'summarize') {
      const built = buildSummarizePrompt(messages);
      prompt = built.prompt;
      system = built.system;
    } else if (cmd.name === 'catch-up') {
      const built = buildCatchUpPrompt(messages, 0);
      prompt = built.prompt;
      system = built.system;
    } else {
      const built = buildDraftPrompt(messages, fullInput);
      prompt = built.prompt;
      system = built.system;
    }

    // Stream response
    startResponse(channelId);
    try {
      for await (const chunk of client.complete(prompt, system)) {
        appendResponse(chunk);
      }
      useAIStore.getState().setProcessing(false);
    } catch (err) {
      setAIError(err instanceof Error ? err.message : 'AI request failed');
    }
  }, [content, channelId, messages, startResponse, appendResponse, setAIError]);

  const handleSend = useCallback(async () => {
    const trimmed = content.trim();
    const hasContent = trimmed.length > 0;
    const hasAttachments = pendingAttachments.length > 0;

    // Nothing to send
    if ((!hasContent && !hasAttachments) || sending) return;

    // If a slash command is active with argument (e.g. /draft some text),
    // handle it as a command instead of sending
    if (hasContent && trimmed.startsWith('/')) {
      const spaceIdx = trimmed.indexOf(' ');
      const cmdName = spaceIdx > 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1);
      // Check if it matches an AI command
      const { AI_COMMANDS } = await import('../../lib/ai/commands');
      const matched = AI_COMMANDS.find((c) => c.name === cmdName);
      if (matched) {
        handleCommandSelect(matched);
        return;
      }
    }

    setSending(true);

    // Capture and clear pending attachments
    const attachmentsToSend = [...pendingAttachments];
    const attachmentIds = attachmentsToSend.map((a) => a.attachmentId);
    const messageContent = hasContent ? trimmed : '';

    // Optimistic local message
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      channelId,
      authorId: userId ?? '',
      authorHandle: handle ?? 'You',
      content: messageContent,
      createdAt: new Date().toISOString(),
      ...(attachmentsToSend.length > 0
        ? {
            attachments: attachmentsToSend.map((a) => ({
              id: a.attachmentId,
              fileNameEncrypted: a.fileNameEncrypted,
              fileSize: a.fileSize,
              encryptionKeyId: a.encryptionKeyId,
              nonce: a.nonce,
            })),
          }
        : {}),
    };
    addMessage(channelId, optimistic);
    setContent('');
    setPendingAttachments([]);

    // Send via REST API (server persists and publishes to Redis for gateway fanout)
    try {
      await sendMessage(
        channelId,
        userId ?? '',
        deviceId ?? '',
        messageContent,
        attachmentIds.length > 0 ? attachmentIds : undefined,
      );
    } catch (err) {
      console.error('Failed to send message:', err);
      // TODO: Show error toast and remove optimistic message
    }

    setSending(false);
  }, [content, sending, channelId, userId, handle, deviceId, addMessage, handleCommandSelect, pendingAttachments]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Let the command palette handle navigation keys when visible
    if (showPalette && ['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(e.key)) {
      return; // The CommandPalette's global keydown handler picks these up
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      fileUploadRef.current?.uploadFile(files[0]);
    }
    // If no files, let the default text paste happen
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    emitTyping();
    setShowPalette(val.startsWith('/') && !val.includes(' '));
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.attachmentId !== attachmentId));
  };

  return (
    <form onSubmit={handleSubmit} className="relative border-t border-border p-4">
      {/* Command palette */}
      <CommandPalette
        input={content}
        onSelect={handleCommandSelect}
        onClose={() => setShowPalette(false)}
        visible={showPalette}
      />

      {/* Pending attachments strip */}
      {hasPendingAttachments && (
        <div className="mb-2 flex flex-wrap gap-2">
          {pendingAttachments.map((att) => (
            <div
              key={att.attachmentId}
              className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1 text-xs text-text-secondary"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 10v2.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5V10M11 5l-3-3-3 3M8 2v8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="max-w-[150px] truncate">{att.fileName}</span>
              <span className="text-text-muted">{formatFileSize(att.fileSize)}</span>
              <button
                type="button"
                onClick={() => removePendingAttachment(att.attachmentId)}
                className="ml-1 text-text-muted hover:text-text-primary"
                title="Remove attachment"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-lg bg-surface-1 px-4 py-2">
        <FileUploadButton
          ref={fileUploadRef}
          channelId={channelId}
          onUploaded={(att) => {
            setPendingAttachments((prev) => [
              ...prev,
              {
                attachmentId: att.attachmentId,
                fileName: decryptFileName(att.fileNameEncrypted),
                fileSize: att.fileSize,
                fileNameEncrypted: att.fileNameEncrypted,
                encryptionKeyId: att.encryptionKeyId,
                nonce: att.nonce,
              },
            ]);
          }}
          disabled={sending || aiProcessing}
        />
        <textarea
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={`Message #${channelName}`}
          rows={1}
          className="max-h-40 flex-1 resize-none bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
          style={{ fontSize: 'var(--font-size-base, 14px)' }}
        />
        <button
          type="submit"
          disabled={(!content.trim() && !hasPendingAttachments) || sending || aiProcessing}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.1L14.9 7.6c.4.2.4.7 0 .9L1.5 15c-.4.2-.9-.1-.8-.5L2.2 9H7a.5.5 0 000-1H2.2L.7 1.5c-.1-.4.4-.7.8-.5z" />
          </svg>
        </button>
      </div>
    </form>
  );
},
);
