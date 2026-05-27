import type { TextBlock, TranslatedBlock, SessionId } from './types';
import { API_BASE_URL, MAX_RETRIES } from './types';
import * as session from './session';
import { getCachedTranslation, setCachedTranslation } from './cache';

class TranslateError extends Error {
  constructor(
    message: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'TranslateError';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function translateBatch(
  items: TextBlock[],
  sessionId: SessionId,
  apiKey: string,
  model: string,
  url: string,
): Promise<TranslatedBlock[]> {
  if (!apiKey) throw new TranslateError('API Key 未配置');

  // 1. 分离缓存命中和未命中
  const results: TranslatedBlock[] = [];
  const uncachedItems: TextBlock[] = [];

  for (const item of items) {
    const cached = await getCachedTranslation(url, item.text);
    if (cached !== null) {
      results.push({ id: item.id, text: cached, fromCache: true });
    } else {
      uncachedItems.push(item);
    }
  }

  if (uncachedItems.length === 0) return results;

  // 2. 检查会话是否已满，满了则创建新会话
  let activeSessionId = sessionId;
  if (await session.isSessionFull(sessionId)) {
    const parts = sessionId.split('_');
    const tabId = parseInt(parts[1]);
    const sessionUrl = parts.slice(2).join('_');
    const suffix = sessionId.includes('_r') ? '' : '_r2';
    // 如果已满，在原 URL 基础上加轮次后缀创建新会话
    activeSessionId = await session.createSessionWithKey(tabId, sessionUrl + suffix);
  }

  // 3. 构建并发送请求（含历史消息）
  await appendTranslationRequest(activeSessionId, uncachedItems);
  const newResults = await callDeepSeekApi(activeSessionId, apiKey, model, uncachedItems, url);
  results.push(...newResults);
  return results;
}

async function appendTranslationRequest(
  sessionId: SessionId,
  items: TextBlock[],
): Promise<void> {
  const requestJson = JSON.stringify(items.map(i => ({ id: i.id, text: i.text })));
  await session.appendMessage(sessionId, 'user', requestJson);
}

async function callDeepSeekApi(
  sessionId: SessionId,
  apiKey: string,
  model: string,
  items: TextBlock[],
  url: string,
): Promise<TranslatedBlock[]> {
  const messages = await session.getMessages(sessionId);
  // messages 前缀严格不变，仅末尾追加新内容，利用 DeepSeek 上下文硬盘缓存
  // 从第 2 次请求起历史部分命中缓存，仅新内容计费
  const body = JSON.stringify({
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body,
      });

      if (!response.ok) {
        if (response.status === 401) throw new TranslateError('API Key 无效');
        if (response.status >= 500) {
          throw new TranslateError(`服务器错误 ${response.status}`, true);
        }
        throw new TranslateError(`API 请求失败 ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) throw new TranslateError('API 返回为空', true);

      const parsed: { id: string; text: string }[] = JSON.parse(content);
      await session.appendMessage(sessionId, 'assistant', content);

      // 输出缓存命中日志
      const usage = data.usage ?? {};
      console.log(
        `[Translator] 缓存命中 tokens: ${usage.prompt_cache_hit_tokens ?? 0}, ` +
        `未命中 tokens: ${usage.prompt_cache_miss_tokens ?? 0}`,
      );

      // 将翻译结果写入本地缓存
      for (const result of parsed) {
        const item = items.find(i => i.id === result.id);
        if (item) {
          await setCachedTranslation(url, item.text, result.text, model);
        }
      }

      return parsed.map(p => ({
        id: p.id,
        text: p.text,
        fromCache: false,
      }));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof TranslateError && !err.retryable) throw err;
      if (attempt < MAX_RETRIES) {
        console.warn(`[Translator] 第 ${attempt + 1} 次重试...`);
        await delay((attempt + 1) * 1000);
      }
    }
  }

  throw new TranslateError(lastError?.message ?? '翻译失败，请重试', true);
}
