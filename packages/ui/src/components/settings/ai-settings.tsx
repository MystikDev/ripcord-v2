'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { getAIConfig, setAIConfig, clearAIConfig, type AIProviderConfig } from '../../lib/ai/ai-client';
import clsx from 'clsx';

export function AISettingsDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<AIProviderConfig['provider']>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      const config = getAIConfig();
      if (config) {
        setProvider(config.provider);
        setApiKey(config.apiKey);
        setModel(config.model ?? '');
        setBaseUrl(config.baseUrl ?? '');
      }
    }
  }, [open]);

  const handleSave = () => {
    setAIConfig({ provider, apiKey, model: model || undefined, baseUrl: baseUrl || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    clearAIConfig();
    setApiKey('');
    setModel('');
    setBaseUrl('');
  };

  const providers: Array<{ value: AIProviderConfig['provider']; label: string; desc: string }> = [
    { value: 'openai', label: 'OpenAI', desc: 'GPT-4o, GPT-4o-mini' },
    { value: 'anthropic', label: 'Anthropic', desc: 'Claude Sonnet, Haiku' },
    { value: 'ollama', label: 'Ollama', desc: 'Local models' },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="AI Settings" description="Configure your AI provider. Keys are stored locally and never sent to our servers.">
        <div className="space-y-4">
          {/* Provider selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Provider</p>
            <div className="flex gap-2">
              {providers.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setProvider(p.value)}
                  className={clsx(
                    'flex-1 rounded-lg border p-2 text-left text-sm transition-colors',
                    provider === p.value
                      ? 'border-accent bg-accent/10 text-text-primary'
                      : 'border-border bg-surface-2 text-text-muted hover:border-text-muted',
                  )}
                >
                  <p className="font-medium">{p.label}</p>
                  <p className="text-xs text-text-muted">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <Input
            label="API Key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === 'ollama' ? 'Not required for Ollama' : 'sk-...'}
          />

          {/* Model override */}
          <Input
            label="Model (optional)"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider === 'openai' ? 'gpt-4o-mini' : provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'llama3'}
          />

          {/* Base URL for Ollama/custom */}
          {(provider === 'ollama' || provider === 'openai') && (
            <Input
              label="Base URL (optional)"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1'}
            />
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={handleClear} className="text-error">
              Clear Config
            </Button>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button onClick={handleSave} disabled={!apiKey && provider !== 'ollama'}>
                {saved ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            Your API key is stored in your browser&apos;s localStorage only. It is never sent to Ripcord servers. AI requests go directly from your browser to the provider.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
