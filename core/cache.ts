import type { CacheEntry } from './types';

function hashString(str: string, length: number): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(length, '0').slice(0, length);
}

export function getCacheKey(url: string, text: string): string {
  const urlHash = hashString(url, 8);
  const textHash = hashString(text, 16);
  return `cache:${urlHash}:${textHash}`;
}

export async function getCachedTranslation(
  url: string,
  text: string,
): Promise<string | null> {
  const key = getCacheKey(url, text);
  const result = await chrome.storage.local.get(key) as Record<string, CacheEntry | undefined>;
  const entry = result[key];
  return entry?.translated ?? null;
}

export async function setCachedTranslation(
  url: string,
  text: string,
  translation: string,
  model: string,
): Promise<void> {
  const key = getCacheKey(url, text);
  const entry: CacheEntry = {
    source: text,
    translated: translation,
    model,
    timestamp: Date.now(),
  };
  await chrome.storage.local.set({ [key]: entry });
}

export async function clearCacheForUrl(url: string): Promise<void> {
  const urlHash = hashString(url, 8);
  const prefix = `cache:${urlHash}:`;
  const allData = await chrome.storage.local.get(null) as Record<string, unknown>;
  const keysToRemove = Object.keys(allData).filter(k => k.startsWith(prefix));
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
}
