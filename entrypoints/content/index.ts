import { extractTextBlocks } from './TextExtractor';
import { applyTranslation, switchDisplayMode, restoreOriginal } from './DomPatcher';
import { FloatingBar } from './FloatingBar';
import type { TextBlock, TranslatedBlock } from '../../core/types';
import { MESSAGE_TYPES, BATCH_SIZE } from '../../core/types';
import './styles/floating-bar.css';
import './styles/translation.css';

let textBlocks: TextBlock[] = [];
let currentMode: 'bilingual' | 'translation-only' = 'bilingual';
let sessionId: string | null = null;
let bar: FloatingBar | null = null;

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    if (window !== window.top) return;

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
  },
});

async function startTranslation(): Promise<void> {
  if (!bar) return;

  const settings = await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_SETTINGS,
  });

  if (!settings.apiKey) {
    bar.setError('请先在插件弹窗中配置 API Key');
    return;
  }

  // 重新提取文本块（可能由于上次清除或 DOM 变化）
  if (textBlocks.length === 0) {
    textBlocks = extractTextBlocks(document.body);
  }

  if (!sessionId) {
    sessionId = await browser.runtime.sendMessage({ type: 'create-session' });
  }

  const batches = chunkArray(textBlocks, BATCH_SIZE);

  for (let i = 0; i < batches.length; i++) {
    bar.setProgress(i + 1, batches.length);
    try {
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        items: batches[i],
        sessionId,
      });

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
  switchDisplayMode(document.body, currentMode);
  if (bar) bar.setMode(currentMode);
}

async function exportHtml(): Promise<void> {
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
}

async function clearTranslation(): Promise<void> {
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
