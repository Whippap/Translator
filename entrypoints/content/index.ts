import { extractTextBlocks } from './TextExtractor';
import { applyTranslation, restoreOriginal } from './DomPatcher';
import { FloatingBar } from './FloatingBar';
import type { TextBlock } from '../../core/types';
import { MESSAGE_TYPES, BATCH_SIZE } from '../../core/types';
import './styles/floating-bar.css';
import './styles/translation.css';

let textBlocks: TextBlock[] = [];
let currentMode: 'bilingual' | 'translation-only' = 'bilingual';
let sessionId: string | null = null;
let bar: FloatingBar | null = null;
/** 缓存所有翻译结果，用于模式切换时重新应用 */
const translationCache = new Map<string, string>();

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    checkEnabled();
  },
});

async function checkEnabled(): Promise<void> {
  const { enabled } = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
  if (!enabled) {
    // 插件已停用，清理 DOM
    if (bar) {
      restoreOriginal(document.body);
      bar.unmount();
      bar = null;
    }
    return;
  }

  if (window !== window.top) return;
  if (bar) return; // 已初始化

  textBlocks = extractTextBlocks(document.body);
  if (textBlocks.length === 0) return;

  bar = new FloatingBar({
    onTranslate: startTranslation,
    onToggleMode: toggleMode,
    onExport: exportHtml,
    onClear: clearTranslation,
  });
  bar.mount();

  watchNavigation();
}

async function startTranslation(): Promise<void> {
  if (!bar) return;

  const settings = await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_SETTINGS,
  });

  if (!settings.apiKey) {
    bar.setError('请先在插件弹窗中配置 API Key');
    return;
  }

  currentMode = settings.displayMode || 'bilingual';
  bar.setMode(currentMode);

  if (textBlocks.length === 0) {
    textBlocks = extractTextBlocks(document.body);
  }

  if (!sessionId) {
    sessionId = await browser.runtime.sendMessage({ type: 'create-session' });
  }

  // 清除旧翻译结果
  translationCache.clear();

  const batches = chunkArray(textBlocks, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    bar.setProgress(i + 1, batches.length);
    try {
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        items: batches[i],
        sessionId,
      });

      // 缓存所有翻译结果
      for (const r of response.results) {
        translationCache.set(r.id, r.text);
      }

      applyTranslation(document.body, batches[i], response.results, currentMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '翻译失败';
      bar.setError(msg);
      return;
    }
  }

  bar.setDone();
}

function toggleMode(): void {
  currentMode =
    currentMode === 'bilingual' ? 'translation-only' : 'bilingual';
  // 重新应用所有翻译（基于当前翻译缓存）
  reapplyAllTranslations();
  if (bar) bar.setMode(currentMode);
}

function reapplyAllTranslations(): void {
  restoreOriginal(document.body);
  for (const block of textBlocks) {
    const translated = translationCache.get(block.id);
    if (translated) {
      applyTranslation(
        document.body,
        [block],
        [{ id: block.id, text: translated, fromCache: true }],
        currentMode,
      );
    }
  }
}

async function exportHtml(): Promise<void> {
  if (!bar) return;
  try {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const cloneBar = clone.querySelector('.__translator_bar');
    if (cloneBar) cloneBar.remove();

    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    const filename = `${document.title || 'translated-page'}.html`;

    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.EXPORT_HTML,
      html,
      filename,
    });

    const status = document.querySelector('.__translator_status');
    if (status) {
      status.textContent = '导出成功，请查看浏览器下载';
      status.className = '__translator_status';
      setTimeout(() => {
        status.textContent = '';
        status.className = '__translator_status';
      }, 3000);
    }
  } catch {
    bar.setError('导出失败，请重试');
  }
}

async function clearTranslation(): Promise<void> {
  translationCache.clear();
  restoreOriginal(document.body);
  textBlocks = extractTextBlocks(document.body);
  if (sessionId) {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.CLEAR_SESSION,
      sessionId,
    });
    sessionId = null;
  }
  if (bar) bar.setIdle();
}

function watchNavigation(): void {
  let lastUrl = location.href;

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    originalPushState(...args);
    onUrlChange();
  };
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    onUrlChange();
  };
  window.addEventListener('popstate', onUrlChange);

  function onUrlChange(): void {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      clearTranslation();
    }
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
