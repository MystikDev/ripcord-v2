/**
 * @module message-composer
 * ORBIT Command Interface. Glass-panel composer with attach button, growing
 * textarea, send button, and context chips. Supports slash-commands, paste-to-
 * upload, file attachments, and AI dispatch with streaming.
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
import { MessageContent } from './message-content';

const EMPTY_MESSAGES: Message[] = [];

// Character count thresholds
const CHAR_COUNT_WARN_THRESHOLD = 1500;
const CHAR_COUNT_MAX = 2000;

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
  const [showPreview, setShowPreview] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const userId = useAuthStore((s) => s.userId);
  const handle = useAuthStore((s) => s.handle);
  const deviceId = useAuthStore((s) => s.deviceId);
  const addMessage = useMessageStore((s) => s.addMessage);
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const replyingTo = useMessageStore((s) => s.replyingTo);
  const clearReply = useMessageStore((s) => s.setReplyingTo);
  const startResponse = useAIStore((s) => s.startResponse);
  const appendResponse = useAIStore((s) => s.appendResponse);
  const setAIError = useAIStore((s) => s.setError);
  const aiProcessing = useAIStore((s) => s.isProcessing);

  const fileUploadRef = useRef<FileUploadHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose uploadFile to parent (ChatArea drag-and-drop handler)
  useImperativeHandle(ref, () => ({
    uploadFile: (file: File) => fileUploadRef.current?.uploadFile(file),
  }), []);

  const lastTypingSent = useRef(0);
  const TYPING_DEBOUNCE_MS = 3_000;

  const hasPendingAttachments = pendingAttachments.length > 0;
  const charCount = content.length;
  const showCharCount = charCount >= CHAR_COUNT_WARN_THRESHOLD;

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

    // Capture reply state before clearing
    const currentReply = useMessageStore.getState().replyingTo;

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
      ...(currentReply ? {
        replyToId: currentReply.messageId,
        replyToAuthor: currentReply.authorHandle,
        replyToContent: currentReply.contentPreview,
      } : {}),
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
    useMessageStore.getState().setReplyingTo(null);

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

  // Derived send button title
  const sendButtonTitle = sending
    ? 'Sending...'
    : (!content.trim() && !hasPendingAttachments)
    ? 'Type a message to send'
    : 'Send message (Enter)';

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="relative shrink-0 px-6 pb-4 pt-2 bg-gradient-to-t from-void via-void/90 to-transparent">
      {/* Command palette */}
      <CommandPalette
        input={content}
        onSelect={handleCommandSelect}
        onClose={() => setShowPalette(false)}
        visible={showPalette}
      />

      <div className="max-w-3xl mx-auto">
        {/* Reply preview bar */}
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-accent/5 border border-accent/20 px-3 py-2 text-xs">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
              <path d="M6 8L2 5l4-3" />
              <path d="M2 5h8a4 4 0 014 4v2" />
            </svg>
            <span className="text-accent font-medium">Replying to {replyingTo.authorHandle}</span>
            <span className="text-text-muted truncate flex-1">{replyingTo.contentPreview}</span>
            <button
              type="button"
              onClick={() => clearReply(null)}
              className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
              title="Cancel reply"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>
        )}

        {/* Pending attachments strip */}
        {hasPendingAttachments && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.attachmentId}
                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-text-secondary"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 10v2.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5V10M11 5l-3-3-3 3M8 2v8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="max-w-[150px] truncate">{att.fileName}</span>
                <span className="text-text-muted">{formatFileSize(att.fileSize)}</span>
                <button
                  type="button"
                  onClick={() => removePendingAttachment(att.attachmentId)}
                  className="ml-1 text-text-muted hover:text-danger transition-colors"
                  title="Remove attachment"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Markdown preview */}
        {showPreview && content.trim() && (
          <div className="mb-2 rounded-xl glass-card p-3 max-h-40 overflow-y-auto">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35 mb-1.5">Preview</p>
            <div className="text-white/80" style={{ fontSize: 'var(--font-size-base, 14px)', color: 'var(--color-chat-text, var(--color-text-primary))' }}>
              <MessageContent content={content} />
            </div>
          </div>
        )}

        {/* Command interface — glass panel */}
        <div className="glass-panel rounded-2xl p-2 flex items-end gap-3">
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
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Transmit to #${channelName}...`}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent text-white placeholder-white/50 focus:outline-none py-2.5 text-[15px]"
            style={{ fontSize: 'var(--font-size-base, 14px)', color: 'var(--color-chat-text, var(--color-text-primary))' }}
          />
          <button
            type="submit"
            disabled={(!content.trim() && !hasPendingAttachments) || sending || aiProcessing}
            title={sendButtonTitle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-black font-bold transition-all hover:bg-accent-hover hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2l-4 4h3v6h2V6h3L8 2z" />
            </svg>
          </button>
        </div>

        {/* Character count — only shown when approaching the limit */}
        {showCharCount && (
          <div className="flex justify-end mt-1 pr-1">
            <span className={`font-mono text-[10px] ${charCount >= CHAR_COUNT_MAX ? 'text-danger' : 'text-white/30'}`}>
              {charCount} / {CHAR_COUNT_MAX}
            </span>
          </div>
        )}

        {/* Context chips */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => { setContent((prev) => prev + '@'); textareaRef.current?.focus(); }}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:text-accent hover:border-accent/30 transition-colors whitespace-nowrap"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="inline mr-1 -mt-0.5 opacity-60"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 2.5a2 2 0 110 4 2 2 0 010-4zM4 11c0-1.5 2.69-2.5 4-2.5s4 1 4 2.5v.5H4V11z"/></svg>
            Mention
          </button>
          <button
            type="button"
            onClick={() => { const input = formRef.current?.querySelector<HTMLInputElement>('input[type="file"]'); input?.click(); }}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:text-accent-magenta hover:border-accent-magenta/30 transition-colors whitespace-nowrap"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline mr-1 -mt-0.5 opacity-60"><path d="M14 10v2.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5V10M11 5l-3-3-3 3M8 2v8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Attach
          </button>
          <button
            type="button"
            onClick={() => { setContent((prev) => prev + '```\n\n```'); textareaRef.current?.focus(); }}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/60 hover:text-accent-yellow hover:border-accent-yellow/30 transition-colors whitespace-nowrap"
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline mr-1 -mt-0.5 opacity-60"><path d="M4 4l4 4-4 4M8 12h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Snippet
          </button>
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition-colors whitespace-nowrap ${
              showPreview
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-white/5 border-white/10 text-white/60 hover:text-accent hover:border-accent/30'
            }`}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="inline mr-1 -mt-0.5 opacity-60"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" /></svg>
            Preview
          </button>
        </div>
      </div>
    </form>
  );
},
);
