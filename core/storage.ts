import { DEFAULT_SETTINGS, type Settings } from './types';

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(['apiKey', 'engine', 'displayMode']) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set(settings);
}

export async function getValue<T = any>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key) as Record<string, T>;
  return result[key];
}

export async function setValue(key: string, value: any): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeValues(keys: string[]): Promise<void> {
  await chrome.storage.local.remove(keys);
}
