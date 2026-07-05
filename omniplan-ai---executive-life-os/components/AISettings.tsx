
import React, { useState, useEffect } from 'react';
import { Brain, Eye, EyeOff, ExternalLink, CheckCircle, Server } from 'lucide-react';
import { AIProviderID, AI_PROVIDERS } from '../services/ai/types';
import { getAISettings, saveAISettings, initAICredentials } from '../services/settings';
import { platform } from '../services/platform';
import { getAiUsageStats, resetAiUsageStats, AiUsageStats } from '../services/ai/tokenLogger';

export const AISettings: React.FC = () => {
  const [provider, setProvider] = useState<AIProviderID>('none');
  const [apiKey, setApiKey] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keychainWarning, setKeychainWarning] = useState(false);
  const [usageStats, setUsageStats] = useState<AiUsageStats>({
    callsCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
  });
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [runningModel, setRunningModel] = useState<string | null>(null);
  const [modelStarting, setModelStarting] = useState<string | null>(null);

  const loadUsageStats = () => {
    setUsageStats(getAiUsageStats());
  };

  useEffect(() => {
    // Ensure the renderer-side cache is populated before reading the API key.
    initAICredentials().then(() => {
      const settings = getAISettings();
      setProvider(settings.provider);
      setApiKey(settings.apiKey);
      setCustomEndpoint(settings.customEndpoint || '');
      setCustomModel(settings.customModel || '');
    });
    loadUsageStats();

    if (typeof window !== 'undefined' && window.electronAPI?.localModelList) {
      window.electronAPI.localModelList().then(files => {
        setLocalModels(files);
      });
      window.electronAPI.localModelStatus().then(status => {
        if (status.running) {
          setRunningModel(status.modelName);
        }
      });
    }
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
    loadUsageStats();
    setTimeout(() => setSaved(false), 2000);
  };

  const handleResetStats = () => {
    resetAiUsageStats();
    loadUsageStats();
  };

  const handleStartModel = async (modelName: string) => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    setModelStarting(modelName);
    const res = await window.electronAPI.localModelStart(modelName, 8080);
    if (res.success) {
      setRunningModel(modelName);
      setCustomEndpoint('http://localhost:8080/v1');
      setCustomModel(modelName);
    } else {
      alert(`Failed to start model: ${res.error || 'unknown error'}`);
    }
    setModelStarting(null);
  };

  const handleStopModel = async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    const ok = await window.electronAPI.localModelStop();
    if (ok) {
      setRunningModel(null);
    }
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
            {!platform.credentials.isAvailable() && (
              <p className="text-[10px] font-bold text-amber-600 mt-1">
                Running in Web Sandbox — key will be saved in plaintext browser storage. Use the desktop app for secure hardware key storage.
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
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomEndpoint('http://localhost:11434/v1');
                        setCustomModel('llama3');
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                    >
                      Ollama Default (11434)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomEndpoint('http://localhost:1234/v1');
                        setCustomModel('default');
                      }}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all"
                    >
                      LM Studio Default (1234)
                    </button>
                  </div>
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

          {/* Local Llamafile Servers */}
          {typeof window !== 'undefined' && !!window.electronAPI && localModels.length > 0 && provider === 'custom' && (
            <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 space-y-4">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Server size={14} className="text-indigo-600"/>
                  Local Llamafile Server Controller
                </h4>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">Launch a self-contained local model directly on your device</p>
              </div>
              
              <div className="space-y-2.5">
                {localModels.map((model) => {
                  const isCurrent = runningModel === model;
                  const isStarting = modelStarting === model;
                  return (
                    <div key={model} className="flex items-center justify-between bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="text-xs font-black text-slate-700 truncate">{model}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}/>
                          {isCurrent ? 'Active server on port 8080' : 'Offline'}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {isCurrent ? (
                          <button
                            type="button"
                            onClick={handleStopModel}
                            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border border-red-100/50"
                          >
                            Stop Server
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartModel(model)}
                            disabled={modelStarting !== null}
                            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border border-indigo-100/50"
                          >
                            {isStarting ? 'Starting...' : 'Start Server'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[9px] font-bold text-slate-500 leading-normal">
                Note: Starting a local server auto-configures your Endpoint to http://localhost:8080/v1 and offloads computation to your system GPU automatically.
              </p>
            </div>
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

          {/* AI Cost & Token Board */}
          <div className="mt-8 pt-8 border-t border-slate-100 space-y-4">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">AI Cost & Token Board</h4>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                Rough estimate from published per-model rates — vendor prices change; unknown/local models count as $0
              </p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Total Calls</span>
                <p className="text-lg font-black text-slate-800 mt-1 leading-none">{usageStats.callsCount}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Prompt Tokens</span>
                <p className="text-lg font-black text-slate-800 mt-1 leading-none">{usageStats.promptTokens.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Output Tokens</span>
                <p className="text-lg font-black text-slate-800 mt-1 leading-none">{usageStats.completionTokens.toLocaleString()}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100/50">
                <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Est. Cost (USD)</span>
                <p className="text-lg font-black text-indigo-600 mt-1 leading-none">${usageStats.estimatedCostUsd.toFixed(4)}</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleResetStats}
              className="text-[9px] font-black uppercase tracking-wider text-slate-400 hover:text-red-500 transition-colors self-start"
            >
              Reset Statistics
            </button>
          </div>
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
