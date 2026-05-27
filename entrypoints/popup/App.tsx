import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../../core/types';
import { DEFAULT_SETTINGS } from '../../core/types';
import { ApiKeyInput } from './components/ApiKeyInput';
import { EngineSelect } from './components/EngineSelect';
import { DisplayModeToggle } from './components/DisplayModeToggle';
import { EnableToggle } from './components/EnableToggle';
import { CacheToggle } from './components/CacheToggle';

interface CacheStats { count: number; bytes: number }

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(
      ['apiKey', 'engine', 'displayMode', 'enabled', 'cacheEnabled'],
      (result) => {
        setSettings({ ...DEFAULT_SETTINGS, ...result });
        setLoaded(true);
      },
    );
    loadCacheStats();
  }, []);

  const update = async (partial: Partial<Settings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await chrome.storage.local.set(partial);
  };

  const loadCacheStats = useCallback(async () => {
    try {
      const stats = await chrome.runtime.sendMessage({ type: 'cache:stats' });
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
    }
  }, []);

  const handleClearAllCache = async () => {
    setClearing(true);
    await chrome.runtime.sendMessage({ type: 'cache:clear-all' });
    await loadCacheStats();
    setClearing(false);
  };

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (!loaded) return null;

  return (
    <div className="translator-popup">
      <h1 className="title">Translator</h1>
      <ApiKeyInput
        value={settings.apiKey}
        onChange={(apiKey) => update({ apiKey })}
      />
      <EngineSelect
        value={settings.engine}
        onChange={(engine) => update({ engine })}
      />
      <DisplayModeToggle
        value={settings.displayMode}
        onChange={(displayMode) => update({ displayMode })}
      />
      <CacheToggle
        value={settings.cacheEnabled}
        onChange={(cacheEnabled) => update({ cacheEnabled })}
      />
      <EnableToggle
        value={settings.enabled}
        onChange={(enabled) => update({ enabled })}
      />

      <hr className="divider" />

      <div className="cache-section">
        <div className="cache-title">缓存管理</div>
        {cacheStats ? (
          <div className="cache-info">
            缓存 {cacheStats.count} 条 · {formatBytes(cacheStats.bytes)}
          </div>
        ) : (
          <div className="cache-info">正在读取...</div>
        )}
        <button
          className="btn-clear-cache"
          onClick={handleClearAllCache}
          disabled={clearing || !cacheStats || cacheStats.count === 0}
        >
          {clearing ? '清除中...' : '清除所有缓存'}
        </button>
      </div>
    </div>
  );
}
