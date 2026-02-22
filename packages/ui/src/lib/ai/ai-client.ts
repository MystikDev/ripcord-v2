/**
 * Abstract AI client interface. All providers implement this.
 */
export interface AIClient {
  /** Stream a completion response. */
  complete(prompt: string, systemPrompt?: string): AsyncGenerator<string, void, unknown>;
  /** Display name for the provider. */
  readonly name: string;
}

/** AI provider configuration stored in localStorage. */
export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'ollama';
  apiKey: string;
  model?: string;
  baseUrl?: string; // For Ollama or custom endpoints
}

const AI_CONFIG_KEY = 'ripcord_ai_config';

/** Get stored AI config from localStorage. */
export function getAIConfig(): AIProviderConfig | null {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    return raw ? (JSON.parse(raw) as AIProviderConfig) : null;
  } catch {
    return null;
  }
}

/** Save AI config to localStorage. */
export function setAIConfig(config: AIProviderConfig): void {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

/** Remove AI config from localStorage. */
export function clearAIConfig(): void {
  localStorage.removeItem(AI_CONFIG_KEY);
}
