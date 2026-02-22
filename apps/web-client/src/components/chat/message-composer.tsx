'use client';

import { useState, useCallback, useRef, type KeyboardEvent, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useMessageStore, type Message } from '@/stores/message-store';
import { sendMessage } from '@/lib/hub-api';
import { gateway } from '@/lib/gateway-client';
import { FileUploadButton } from '@/components/chat/file-upload-button';
import { CommandPalette } from '@/components/chat/command-palette';
import { useAIStore } from '@/stores/ai-store';
import { getAIConfig } from '@/lib/ai/ai-client';
import { OpenAIClient } from '@/lib/ai/openai-client';
import { AnthropicClient } from '@/lib/ai/anthropic-client';
import { buildSummarizePrompt, buildCatchUpPrompt, buildDraftPrompt } from '@/lib/ai/prompt-builder';
import type { SlashCommand } from '@/lib/ai/commands';

const EMPTY_MESSAGES: Message[] = [];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MessageComposerProps {
  channelId: string;
  channelName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageComposer({ channelId, channelName }: MessageComposerProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const userId = useAuthStore((s) => s.userId);
  const handle = useAuthStore((s) => s.handle);
  const deviceId = useAuthStore((s) => s.deviceId);
  const addMessage = useMessageStore((s) => s.addMessage);
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const startResponse = useAIStore((s) => s.startResponse);
  const appendResponse = useAIStore((s) => s.appendResponse);
  const setAIError = useAIStore((s) => s.setError);
  const aiProcessing = useAIStore((s) => s.isProcessing);

  const lastTypingSent = useRef(0);
  const TYPING_DEBOUNCE_MS = 3_000;

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
    if (!trimmed || sending) return;

    // If a slash command is active with argument (e.g. /draft some text),
    // handle it as a command instead of sending
    if (trimmed.startsWith('/')) {
      const spaceIdx = trimmed.indexOf(' ');
      const cmdName = spaceIdx > 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1);
      // Check if it matches an AI command
      const { AI_COMMANDS } = await import('@/lib/ai/commands');
      const matched = AI_COMMANDS.find((c) => c.name === cmdName);
      if (matched) {
        handleCommandSelect(matched);
        return;
      }
    }

    setSending(true);

    // Optimistic local message
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      channelId,
      authorId: userId ?? '',
      authorHandle: handle ?? 'You',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    addMessage(channelId, optimistic);
    setContent('');

    // Send via REST API (server persists and publishes to Redis for gateway fanout)
    try {
      await sendMessage(
        channelId,
        userId ?? '',
        deviceId ?? '',
        trimmed,
      );
    } catch (err) {
      console.error('Failed to send message:', err);
      // TODO: Show error toast and remove optimistic message
    }

    setSending(false);
  }, [content, sending, channelId, userId, handle, deviceId, addMessage, handleCommandSelect]);

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

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    emitTyping();
    setShowPalette(val.startsWith('/') && !val.includes(' '));
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

      <div className="flex items-end gap-2 rounded-lg bg-surface-1 px-4 py-2">
        <FileUploadButton
          channelId={channelId}
          onUploaded={(att) => {
            console.log('File uploaded:', att);
            // TODO: Attach to next message or create attachment-only message
          }}
          disabled={sending || aiProcessing}
        />
        <textarea
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName}`}
          rows={1}
          className="max-h-40 flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="submit"
          disabled={!content.trim() || sending || aiProcessing}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.5 1.1L14.9 7.6c.4.2.4.7 0 .9L1.5 15c-.4.2-.9-.1-.8-.5L2.2 9H7a.5.5 0 000-1H2.2L.7 1.5c-.1-.4.4-.7.8-.5z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
