import { useState, useEffect } from 'react';
import type { Settings } from '../../core/types';
import { DEFAULT_SETTINGS } from '../../core/types';
import { ApiKeyInput } from './components/ApiKeyInput';
import { EngineSelect } from './components/EngineSelect';
import { DisplayModeToggle } from './components/DisplayModeToggle';

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(
      ['apiKey', 'engine', 'displayMode'],
      (result) => {
        setSettings({ ...DEFAULT_SETTINGS, ...result });
        setLoaded(true);
      },
    );
  }, []);

  const update = async (partial: Partial<Settings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    await chrome.storage.local.set(partial);
  };

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
    </div>
  );
}
