import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, getValue, setValue } from '../../core/storage';
import { DEFAULT_SETTINGS } from '../../core/types';

const mockStorage: Record<string, any> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  chrome.storage.local.get = async (keys: string | string[] | null) => {
    if (keys === null) return { ...mockStorage };
    const keyArr = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, any> = {};
    for (const key of keyArr) {
      if (key in mockStorage) result[key] = mockStorage[key];
    }
    return result;
  };
  chrome.storage.local.set = async (items: Record<string, any>) => {
    Object.assign(mockStorage, items);
  };
  chrome.storage.local.remove = async (keys: string | string[]) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const key of arr) delete mockStorage[key];
  };
});

describe('getSettings', () => {
  it('returns defaults when storage is empty', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('merges stored values with defaults', async () => {
    mockStorage.apiKey = 'sk-test-123';
    mockStorage.engine = 'deepseek-v4-pro';
    const settings = await getSettings();
    expect(settings.apiKey).toBe('sk-test-123');
    expect(settings.engine).toBe('deepseek-v4-pro');
    expect(settings.displayMode).toBe('bilingual');
  });
});

describe('saveSettings', () => {
  it('writes all settings to storage', async () => {
    await saveSettings({ apiKey: 'sk-new', engine: 'deepseek-v4-pro', displayMode: 'translation-only' });
    expect(mockStorage.apiKey).toBe('sk-new');
    expect(mockStorage.engine).toBe('deepseek-v4-pro');
    expect(mockStorage.displayMode).toBe('translation-only');
  });
});

describe('getValue', () => {
  it('returns value for a single key', async () => {
    mockStorage.foo = 'bar';
    const val = await getValue('foo');
    expect(val).toBe('bar');
  });
});

describe('setValue', () => {
  it('writes a single key-value pair', async () => {
    await setValue('foo', 'bar');
    expect(mockStorage.foo).toBe('bar');
  });
});
