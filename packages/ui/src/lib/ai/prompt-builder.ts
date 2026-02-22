import type { Message } from '../../stores/message-store';

/** Format messages into a readable conversation for the AI. */
function formatMessages(messages: Message[]): string {
  return messages
    .map((m) => `[${m.authorHandle}] ${m.content}`)
    .join('\n');
}

/** Build a prompt for summarizing recent messages. */
export function buildSummarizePrompt(messages: Message[]): { prompt: string; system: string } {
  const formatted = formatMessages(messages);
  return {
    system: 'You are a helpful assistant that summarizes chat conversations. Be concise and highlight key points, decisions, and action items.',
    prompt: `Summarize the following conversation:\n\n${formatted}`,
  };
}

/** Build a prompt for catching up on missed messages. */
export function buildCatchUpPrompt(messages: Message[], lastReadIndex: number): { prompt: string; system: string } {
  const unread = messages.slice(lastReadIndex);
  const formatted = formatMessages(unread);
  return {
    system: 'You are a helpful assistant that helps users catch up on conversations they missed. Highlight important decisions, questions that need their attention, and any action items.',
    prompt: `I missed these messages. Give me a quick catch-up:\n\n${formatted}`,
  };
}

/** Build a prompt for drafting a response. */
export function buildDraftPrompt(messages: Message[], instruction: string): { prompt: string; system: string } {
  const recent = messages.slice(-20); // Last 20 messages for context
  const formatted = formatMessages(recent);
  return {
    system: 'You are a helpful assistant that drafts chat messages. Write in a natural, conversational tone matching the chat style. Keep it concise.',
    prompt: `Here's the recent conversation:\n\n${formatted}\n\nDraft a message based on this instruction: ${instruction}`,
  };
}
