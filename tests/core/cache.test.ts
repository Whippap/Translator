import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedTranslation,
  setCachedTranslation,
  clearCacheForUrl,
  getCacheKey,
} from '../../core/cache';

const mockLocal: Record<string, any> = {};

beforeEach(() => {
  Object.keys(mockLocal).forEach(k => delete mockLocal[k]);
  // @ts-expect-error mock for tests
  chrome.storage.local = {
    get: async (keys: string | string[] | null) => {
      if (keys === null) return { ...mockLocal };
      const keyArr = Array.isArray(keys) ? keys : [keys];
      const result: Record<string, any> = {};
      for (const key of keyArr) {
        if (key in mockLocal) result[key] = mockLocal[key];
      }
      return result;
    },
    set: async (items: Record<string, any>) => {
      Object.assign(mockLocal, items);
    },
    remove: async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const key of arr) delete mockLocal[key];
    },
  };
});

describe('getCacheKey', () => {
  it('generates deterministic key from URL and text', () => {
    const key1 = getCacheKey('https://example.com/page', 'hello world');
    const key2 = getCacheKey('https://example.com/page', 'hello world');
    expect(key1).toBe(key2);
  });

  it('generates different keys for different texts', () => {
    const key1 = getCacheKey('https://example.com', 'hello');
    const key2 = getCacheKey('https://example.com', 'world');
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different URLs', () => {
    const key1 = getCacheKey('https://a.com', 'hello');
    const key2 = getCacheKey('https://b.com', 'hello');
    expect(key1).not.toBe(key2);
  });
});

describe('getCachedTranslation', () => {
  it('returns null when no cache exists', async () => {
    const result = await getCachedTranslation('https://example.com', 'hello');
    expect(result).toBeNull();
  });

  it('returns cached translation when present', async () => {
    await setCachedTranslation(
      'https://example.com',
      'hello',
      '你好',
      'deepseek-v4-flash',
    );
    const result = await getCachedTranslation('https://example.com', 'hello');
    expect(result).toBe('你好');
  });
});

describe('setCachedTranslation', () => {
  it('stores translation with metadata', async () => {
    await setCachedTranslation(
      'https://example.com',
      'hello',
      '你好',
      'deepseek-v4-flash',
    );
    const key = getCacheKey('https://example.com', 'hello');
    const entry = mockLocal[key];
    expect(entry.translated).toBe('你好');
    expect(entry.model).toBe('deepseek-v4-flash');
    expect(entry.timestamp).toBeTypeOf('number');
  });
});

describe('clearCacheForUrl', () => {
  it('removes all cache entries for a specific URL', async () => {
    await setCachedTranslation(
      'https://example.com',
      'hello',
      '你好',
      'deepseek-v4-flash',
    );
    await setCachedTranslation(
      'https://example.com',
      'world',
      '世界',
      'deepseek-v4-flash',
    );
    await setCachedTranslation(
      'https://other.com',
      'foo',
      '福',
      'deepseek-v4-flash',
    );

    await clearCacheForUrl('https://example.com');

    expect(
      await getCachedTranslation('https://example.com', 'hello'),
    ).toBeNull();
    expect(
      await getCachedTranslation('https://example.com', 'world'),
    ).toBeNull();
    expect(
      await getCachedTranslation('https://other.com', 'foo'),
    ).toBe('福');
  });
});
