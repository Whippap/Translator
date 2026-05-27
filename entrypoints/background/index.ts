import type { TextBlock } from '../../core/types';
import { MESSAGE_TYPES } from '../../core/types';
import { translateBatch } from '../../core/translator';
import { createSession, endSession } from '../../core/session';
import { getSettings } from '../../core/storage';
import { clearCacheForUrl, clearAllCache, getCacheStats } from '../../core/cache';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: any, sender) => {
    switch (message.type) {
      case MESSAGE_TYPES.GET_SETTINGS:
        return getSettings();

      case MESSAGE_TYPES.TRANSLATE_BATCH: {
        const { items, sessionId, skipCache } = message;
        return handleTranslateBatch(
          items as TextBlock[],
          sessionId as string,
          sender.tab?.url,
          skipCache as boolean,
        );
      }

      case MESSAGE_TYPES.CLEAR_SESSION: {
        const { sessionId } = message;
        return handleClearSession(sessionId as string, sender.tab?.url);
      }

      case MESSAGE_TYPES.EXPORT_HTML: {
        const { html, filename } = message;
        return handleExportHtml(html as string, filename as string);
      }

      case 'create-session': {
        if (!sender.tab?.id || !sender.tab?.url) return;
        return createSession(sender.tab.id, sender.tab.url);
      }

      case 'cache:stats':
        return getCacheStats();

      case 'cache:clear-all':
        return clearAllCache();

      default:
        return;
    }
  });
});

async function handleTranslateBatch(
  items: TextBlock[],
  sessionId: string,
  tabUrl?: string,
  skipCache: boolean = false,
): Promise<{ results: { id: string; text: string; fromCache: boolean }[]; allCached: boolean }> {
  const settings = await getSettings();

  if (!settings.apiKey) {
    throw new Error('请先在插件弹窗中配置 API Key');
  }

  // 用户关闭缓存 或 显式跳过缓存时，不走缓存
  const effectiveSkipCache = !settings.cacheEnabled || skipCache;

  const url = tabUrl ?? extractUrlFromSession(sessionId);
  const results = await translateBatch(
    items,
    sessionId,
    settings.apiKey,
    settings.engine,
    url,
    effectiveSkipCache,
  );
  const allCached = results.every(r => r.fromCache);

  return { results, allCached };
}

async function handleClearSession(
  sessionId: string,
  url?: string,
): Promise<void> {
  await endSession(sessionId);
  if (url) {
    await clearCacheForUrl(url);
  }
}

async function handleExportHtml(
  html: string,
  filename: string,
): Promise<void> {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  await browser.downloads.download({
    url,
    filename,
  });
}

function extractUrlFromSession(sessionId: string): string {
  const parts = sessionId.split('_');
  parts.shift(); // remove 'session'
  parts.shift(); // remove tabId
  return parts.join('_');
}
