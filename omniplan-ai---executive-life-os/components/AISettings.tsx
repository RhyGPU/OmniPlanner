
import React, { useState, useEffect } from 'react';
import { Brain, Eye, EyeOff, ExternalLink, CheckCircle, Server } from 'lucide-react';
import { AIProviderID, AI_PROVIDERS } from '../services/ai/types';
import { getAISettings, saveAISettings, initAICredentials } from '../services/settings';
import { platform } from '../services/platform';

export const AISettings: React.FC = () => {
  const [provider, setProvider] = useState<AIProviderID>('none');
  const [apiKey, setApiKey] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keychainWarning, setKeychainWarning] = useState(false);

  useEffect(() => {
    // Ensure the renderer-side cache is populated before reading the API key.
    initAICredentials().then(() => {
      const settings = getAISettings();
      setProvider(settings.provider);
      setApiKey(settings.apiKey);
      setCustomEndpoint(settings.customEndpoint || '');
      setCustomModel(settings.customModel || '');
    });
  }, []);

  const handleSave = async () => {
    const ok = await saveAISettings({
      provider,
      apiKey: apiKey.trim(),
      customEndpoint: customEndpoint.trim(),
      customModel: customModel.trim(),
    });
    setKeychainWarning(!ok);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const currentInfo = AI_PROVIDERS[provider];
  const providerList = Object.values(AI_PROVIDERS);
  const showEndpointFields = provider === 'openrouter' || provider === 'custom';

  return (
    <div className="bg-white rounded-[2.5rem] border-2 border-slate-50 p-10">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-lg shadow-indigo-100/50">
          <Brain size={24} strokeWidth={2.5}/>
        </div>
        <div>
          <h3 className="font-black text-2xl text-slate-900 tracking-tight">AI Provider</h3>
          <p className="text-slate-400 text-xs font-bold mt-1">Choose which AI powers your planner</p>
        </div>
      </div>

      {/* Readiness status — derived from current draft form state */}
      {(() => {
        const draftReady = provider !== 'none' && (!!apiKey.trim() || provider === 'custom');
        const dotClass = draftReady ? 'bg-emerald-400' : 'bg-slate-300';
        const statusText =
          provider === 'none'
            ? 'AI features are disabled — select a provider below'
            : draftReady
            ? `${currentInfo.name} — ready${!saved ? ' (unsaved changes)' : ''}`
            : `${currentInfo.name} selected — API key required`;
        return (
          <div className="flex items-center gap-2.5 mb-6 px-4 py-2.5 bg-slate-50 rounded-2xl border border-slate-100">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`}/>
            <span className="text-xs font-bold text-slate-600">{statusText}</span>
          </div>
        );
      })()}

      {/* Provider Selection */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {providerList.map((info) => (
          <button
            key={info.id}
            onClick={() => setProvider(info.id)}
            className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
              provider === info.id
                ? 'border-indigo-500 bg-indigo-50 shadow-lg shadow-indigo-100/50'
                : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'
            }`}
          >
            <div className={`text-sm font-black tracking-tight ${
              provider === info.id ? 'text-indigo-700' : 'text-slate-700'
            }`}>
              {info.name}
            </div>
            <div className="text-[10px] font-bold text-slate-400 mt-1 leading-relaxed">
              {info.description}
            </div>
          </button>
        ))}
      </div>

      {/* Configuration Fields */}
      {provider !== 'none' && (
        <div className="space-y-5">
          {/* API Key */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
              {currentInfo.name} API Key {provider === 'custom' && '(optional for local)'}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={currentInfo.apiKeyPlaceholder}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 pr-12 text-sm font-mono font-bold focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showKey ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-2">
              Your key is stored locally on your device. Never sent anywhere except the AI provider.
            </p>
            {keychainWarning && (
              <p className="text-[10px] font-bold text-amber-600 mt-1">
                OS keychain unavailable — key saved in plain local storage. Install a keyring daemon for encrypted storage.
              </p>
            )}
          </div>

          {/* Custom Endpoint URL (for OpenRouter and Custom) */}
          {showEndpointFields && (
            <>
              {provider === 'custom' && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                    API Endpoint URL
                  </label>
                  <div className="relative">
                    <Server size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input
                      type="text"
                      value={customEndpoint}
                      onChange={(e) => setCustomEndpoint(e.target.value)}
                      placeholder="http://localhost:1234/v1"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-11 pr-5 py-4 text-sm font-mono font-bold focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-2">
                    LM Studio: http://localhost:1234/v1 &nbsp;&nbsp; Ollama: http://localhost:11434/v1
                  </p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                  Model Name
                </label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder={provider === 'openrouter' ? 'meta-llama/llama-3.1-8b-instruct:free' : 'default'}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-mono font-bold focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
                />
                <p className="text-[10px] font-bold text-slate-400 mt-2">
                  {provider === 'openrouter' && 'Browse models at openrouter.ai/models — many free models available.'}
                  {provider === 'custom' && 'The model ID loaded in your local server. Leave as "default" for auto-detect.'}
                </p>
              </div>
            </>
          )}

          {currentInfo.docsUrl && (
            <a
              href={currentInfo.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-black text-indigo-600 hover:text-indigo-800 transition-colors"
              onClick={(e) => {
                e.preventDefault();
                platform.shell.openExternal(currentInfo.docsUrl);
              }}
            >
              <ExternalLink size={14}/>
              Get your {currentInfo.name} API key
            </a>
          )}

          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-95 ${
              saved
                ? 'bg-emerald-600 text-white shadow-emerald-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            {saved ? <><CheckCircle size={16}/> Saved</> : 'Save AI Settings'}
          </button>
        </div>
      )}

      {provider === 'none' && (
        <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <p className="text-sm font-bold text-slate-400">
            AI features are disabled. Select a provider above to enable smart planning.
          </p>
        </div>
      )}
    </div>
  );
};
