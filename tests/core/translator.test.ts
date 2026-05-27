import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateBatch } from '../../core/translator';
import * as cache from '../../core/cache';
import type { TextBlock } from '../../core/types';

const mockSessionData: Record<string, any> = {};
const mockLocal: Record<string, any> = {};

beforeEach(() => {
  vi.restoreAllMocks();
  Object.keys(mockSessionData).forEach(k => delete mockSessionData[k]);
  Object.keys(mockLocal).forEach(k => delete mockLocal[k]);

  chrome.storage.session.get = async (keys: string | string[] | null) => {
    if (keys === null) return { ...mockSessionData };
    const keyArr = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, any> = {};
    for (const key of keyArr) {
      if (key in mockSessionData) result[key] = mockSessionData[key];
    }
    return result;
  };
  chrome.storage.session.set = async (items: Record<string, any>) => {
    Object.assign(mockSessionData, items);
  };
  chrome.storage.session.remove = async (keys: string | string[]) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const key of arr) delete mockSessionData[key];
  };

  chrome.storage.local.get = async (keys: string | string[] | null) => {
    if (keys === null) return { ...mockLocal };
    const keyArr = Array.isArray(keys) ? keys : [keys];
    const result: Record<string, any> = {};
    for (const key of keyArr) {
      if (key in mockLocal) result[key] = mockLocal[key];
    }
    return result;
  };
  chrome.storage.local.set = async (items: Record<string, any>) => {
    Object.assign(mockLocal, items);
  };
  chrome.storage.local.remove = async () => {};

  global.fetch = vi.fn();
});

const makeItems = (n: number): TextBlock[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i + 1}`,
    text: `Text block ${i + 1}`,
    parentSelector: 'p',
  }));

const mockApiResponse = (items: TextBlock[]) => {
  const translated = items.map(i => ({ id: i.id, text: `翻译:${i.text}` }));
  return JSON.stringify(translated);
};

describe('translateBatch', () => {
  it('sends correct API request', async () => {
    const items = makeItems(1);
    mockSessionData['session_1_example.com/page'] = [
      { role: 'system', content: 'You are a translator.' },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: mockApiResponse(items) } }],
        usage: { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 50 },
      }),
    } as Response);

    const result = await translateBatch(
      items,
      'session_1_example.com/page',
      'sk-test-key',
      'deepseek-v4-flash',
      'https://example.com/page',
    );

    expect(fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('翻译:Text block 1');
  });

  it('returns items from cache when available', async () => {
    const items = makeItems(1);
    const cacheKey = cache.getCacheKey('https://example.com/page', items[0].text);
    await cache.setCachedTranslation('https://example.com/page', items[0].text, '缓存译文', 'deepseek-v4-flash');

    mockSessionData['session_1_example.com/page'] = [
      { role: 'system', content: 'You are a translator.' },
    ];

    const result = await translateBatch(
      items,
      'session_1_example.com/page',
      'sk-test-key',
      'deepseek-v4-flash',
      'https://example.com/page',
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result[0].text).toBe('缓存译文');
    expect(result[0].fromCache).toBe(true);
  });

  it('retries on network failure', async () => {
    const items = makeItems(1);
    mockSessionData['session_1_example.com/page'] = [
      { role: 'system', content: 'You are a translator.' },
    ];

    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: mockApiResponse(items) } }],
          usage: {},
        }),
      } as Response);

    const result = await translateBatch(
      items,
      'session_1_example.com/page',
      'sk-test-key',
      'deepseek-v4-flash',
      'https://example.com',
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result[0].text).toBe('翻译:Text block 1');
  });

  it('throws error when API Key is missing', async () => {
    await expect(
      translateBatch(makeItems(1), 'session_x', '', 'deepseek-v4-flash', 'https://example.com'),
    ).rejects.toThrow('API Key 未配置');
  });

  it('throws on 401 unauthorized', async () => {
    mockSessionData['session_1_example.com/page'] = [
      { role: 'system', content: 'You are a translator.' },
    ];

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
    } as Response);

    await expect(
      translateBatch(makeItems(1), 'session_1_example.com/page', 'sk-bad-key', 'deepseek-v4-flash', 'https://example.com'),
    ).rejects.toThrow('API Key 无效');
  });

  it('creates new session when current session is full', async () => {
    const items = makeItems(1);
    // Fill session with 10 rounds (20 user+assistant msgs + 1 system = 21 msgs)
    const messages = [{ role: 'system' as const, content: 'sys' }];
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'user' as const, content: `u${i}` });
      messages.push({ role: 'assistant' as const, content: `a${i}` });
    }
    mockSessionData['session_1_example.com/page'] = messages;

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: mockApiResponse(items) } }],
        usage: {},
      }),
    } as Response);

    const result = await translateBatch(
      items,
      'session_1_example.com/page',
      'sk-test-key',
      'deepseek-v4-flash',
      'https://example.com',
    );

    expect(result).toHaveLength(1);
    // Should have created a new session
    const newSessionKey = Object.keys(mockSessionData).find(k => k !== 'session_1_example.com/page');
    expect(newSessionKey).toBeDefined();
  });
});
