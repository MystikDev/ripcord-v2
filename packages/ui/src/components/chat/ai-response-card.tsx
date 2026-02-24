/**
 * @module ai-response-card
 * In-channel card displaying streaming AI assistant responses with a loading
 * animation, Copy and Send-as-message buttons, and Dismiss.
 */
'use client';

import { useAIStore } from '../../stores/ai-store';
import { Button } from '../ui/button';

interface AIResponseCardProps {
  channelId: string;
  onSendAsMessage?: (content: string) => void;
}

export function AIResponseCard({ channelId, onSendAsMessage }: AIResponseCardProps) {
  const isProcessing = useAIStore((s) => s.isProcessing);
  const currentResponse = useAIStore((s) => s.currentResponse);
  const error = useAIStore((s) => s.error);
  const activeChannelId = useAIStore((s) => s.activeChannelId);
  const clearResponse = useAIStore((s) => s.clearResponse);

  // Only show for the active channel
  if (activeChannelId !== channelId) return null;
  if (!currentResponse && !isProcessing && !error) return null;

  return (
    <div className="mx-4 mb-2 rounded-lg border border-accent/20 bg-accent/5 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-accent">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 12.5a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM6.25 4h1.5v4h-1.5V4zm0 5h1.5v1.5h-1.5V9z" />
        </svg>
        <span>AI Assistant</span>
        {isProcessing && (
          <span className="ml-auto flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
          </span>
        )}
      </div>

      {/* Content */}
      {error ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-text-secondary leading-relaxed">
          {currentResponse || 'Thinking...'}
        </p>
      )}

      {/* Actions */}
      {!isProcessing && currentResponse && (
        <div className="mt-3 flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard.writeText(currentResponse);
            }}
            className="h-7 px-2 text-xs"
          >
            Copy
          </Button>
          {onSendAsMessage && (
            <Button
              variant="ghost"
              onClick={() => {
                onSendAsMessage(currentResponse);
                clearResponse();
              }}
              className="h-7 px-2 text-xs"
            >
              Send as message
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={clearResponse}
            className="ml-auto h-7 px-2 text-xs text-text-muted"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
