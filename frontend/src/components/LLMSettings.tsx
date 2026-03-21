import { useEffect, useState } from 'react';
import { Loader2, Check, Bot } from 'lucide-react';
import { Button } from './ui/Button';
import { llmApi } from '../services/api';
import type { LLMConfig, LLMProvider } from '../services/api';

export function LLMSettings() {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [selectedProvider, setSelectedProvider] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data } = await llmApi.getConfig();
      setConfig(data);
      setSelectedProvider(data.provider);
      setModel(data.model);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = config?.available_providers.find((p) => p.id === providerId);
    if (provider) {
      setModel(provider.model);
    }
    setApiKey('');
    setBaseUrl('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string | number> = { provider: selectedProvider };
      if (model) payload.model = model;
      if (apiKey) payload.api_key = apiKey;
      if (baseUrl) payload.base_url = baseUrl;
      await llmApi.updateConfig(payload);
      await loadConfig();
    } catch (err: any) {
      alert(`Failed to update: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={14} className="animate-spin" /> Loading LLM config...
      </div>
    );
  }

  if (!config) return null;

  const currentProviderInfo = config.available_providers.find((p) => p.id === selectedProvider);
  const needsApiKey = selectedProvider !== 'ollama' && !currentProviderInfo?.configured;
  const hasChanged = selectedProvider !== config.provider || model !== config.model || apiKey || baseUrl;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Bot size={18} className="text-blue-600" />
        <h2 className="text-lg font-semibold">LLM Provider</h2>
        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
          {config.provider} / {config.model}
        </span>
      </div>

      {/* Provider selection */}
      <div className="grid grid-cols-5 gap-2">
        {config.available_providers.map((p: LLMProvider) => (
          <button
            key={p.id}
            onClick={() => handleProviderChange(p.id)}
            className={`relative p-3 rounded-lg border text-sm font-medium transition-all ${
              selectedProvider === p.id
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300 text-gray-600'
            }`}
          >
            {p.name}
            {p.configured && p.id !== 'ollama' && (
              <Check size={12} className="absolute top-1 right-1 text-green-500" />
            )}
          </button>
        ))}
      </div>

      {/* Model + optional API key */}
      <div className="flex gap-3">
        <div className="flex-1 space-y-1">
          <label className="block text-xs font-medium text-gray-500">Model</label>
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model name"
          />
        </div>

        {selectedProvider !== 'ollama' && (
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-medium text-gray-500">
              API Key {currentProviderInfo?.configured && <span className="text-green-500">(set)</span>}
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={currentProviderInfo?.configured ? 'Leave blank to keep current' : 'Enter API key'}
            />
          </div>
        )}

        {(selectedProvider === 'openai' || selectedProvider === 'deepseek') && (
          <div className="flex-1 space-y-1">
            <label className="block text-xs font-medium text-gray-500">Base URL (optional)</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Custom API endpoint"
            />
          </div>
        )}
      </div>

      {hasChanged && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving || (needsApiKey && !apiKey)}>
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Check size={14} className="mr-1" />}
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            setSelectedProvider(config.provider);
            setModel(config.model);
            setApiKey('');
            setBaseUrl('');
          }}>
            Cancel
          </Button>
          {needsApiKey && !apiKey && (
            <span className="text-xs text-amber-600">API key required for {currentProviderInfo?.name}</span>
          )}
        </div>
      )}
    </div>
  );
}
