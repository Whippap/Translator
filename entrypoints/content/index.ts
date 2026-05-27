import { extractTextBlocks } from './TextExtractor';
import { applyTranslation, restoreOriginal } from './DomPatcher';
import { FloatingBar } from './FloatingBar';
import type { TextBlock } from '../../core/types';
import { MESSAGE_TYPES, BATCH_SIZE } from '../../core/types';
import './styles/floating-bar.css';
import './styles/translation.css';

const DEBUG = true;
function log(...args: unknown[]): void {
  if (DEBUG) console.log('[Translator]', ...args);
}

let textBlocks: TextBlock[] = [];
let currentMode: 'bilingual' | 'translation-only' = 'bilingual';
let sessionId: string | null = null;
let bar: FloatingBar | null = null;
const translationCache = new Map<string, string>();

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    log('Content Script 启动, location:', location.href);
    checkEnabled();
  },
});

async function checkEnabled(): Promise<void> {
  const settings = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
  log('检查插件状态:', settings.enabled ? '已启用' : '已停用');

  if (!settings.enabled) {
    if (bar) {
      restoreOriginal(document.body);
      bar.unmount();
      bar = null;
    }
    return;
  }

  if (window !== window.top) {
    log('跳过 iframe');
    return;
  }
  if (bar) {
    log('已初始化，跳过');
    return;
  }

  textBlocks = extractTextBlocks(document.body);
  log(`提取到 ${textBlocks.length} 个文本块`);

  if (textBlocks.length === 0) {
    log('页面无可翻译文本');
    return;
  }

  bar = new FloatingBar({
    onTranslate: startTranslation,
    onToggleMode: toggleMode,
    onExport: exportHtml,
    onClear: clearTranslation,
  });
  bar.mount();
  log('浮动控制条已挂载');

  watchNavigation();
}

async function startTranslation(): Promise<void> {
  if (!bar) return;
  log('=== 开始翻译 ===');

  const settings = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
  log('当前设置:', { apiKey: settings.apiKey ? '***' + settings.apiKey.slice(-4) : '(空)', engine: settings.engine, displayMode: settings.displayMode });

  if (!settings.apiKey) {
    bar.setError('请先在插件弹窗中配置 API Key');
    return;
  }

  currentMode = settings.displayMode || 'bilingual';
  log('翻译模式:', currentMode);
  bar.setMode(currentMode);

  if (textBlocks.length === 0) {
    textBlocks = extractTextBlocks(document.body);
    log(`重新提取到 ${textBlocks.length} 个文本块`);
  }

  if (!sessionId) {
    sessionId = await browser.runtime.sendMessage({ type: 'create-session' });
    log('创建会话:', sessionId);
  }

  translationCache.clear();

  const batches = chunkArray(textBlocks, BATCH_SIZE);
  log(`共 ${batches.length} 批次，每批 ${BATCH_SIZE} 个`);

  for (let i = 0; i < batches.length; i++) {
    bar.setProgress(i + 1, batches.length);
    log(`发送第 ${i + 1}/${batches.length} 批 (${batches[i].length} 项)...`);
    try {
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        items: batches[i],
        sessionId,
      });
      log(`第 ${i + 1} 批返回 ${response.results.length} 条结果, 全部缓存命中: ${response.allCached}`);

      for (const r of response.results) {
        translationCache.set(r.id, r.text);
      }

      applyTranslation(document.body, batches[i], response.results, currentMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '翻译失败';
      log('翻译出错:', msg, err);
      bar.setError(msg);
      return;
    }
  }

  log('=== 翻译完成 ===');
  bar.setDone();
}

function toggleMode(): void {
  log(`=== 切换模式: ${currentMode} → ${currentMode === 'bilingual' ? 'translation-only' : 'bilingual'} ===`);
  currentMode = currentMode === 'bilingual' ? 'translation-only' : 'bilingual';
  log(`翻译缓存中有 ${translationCache.size} 条结果`);
  reapplyAllTranslations();
  if (bar) bar.setMode(currentMode);
  log('模式切换完成');
}

function reapplyAllTranslations(): void {
  // 恢复 DOM 到翻译前状态（保留 data-trans-id 以重新定位元素）
  restoreOriginal(document.body);
  let applied = 0;
  for (const block of textBlocks) {
    const translated = translationCache.get(block.id);
    if (translated) {
      applyTranslation(
        document.body,
        [block],
        [{ id: block.id, text: translated, fromCache: true }],
        currentMode,
      );
      applied++;
    }
  }
  log(`reapplyAllTranslations: 重新应用了 ${applied} 个翻译块, 模式: ${currentMode}`);
}

function exportHtml(): void {
  if (!bar) return;
  log('=== 导出 HTML ===');
  try {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const cloneBar = clone.querySelector('.__translator_bar');
    if (cloneBar) cloneBar.remove();

    // 将相对 URL 转为绝对 URL，保留页面样式和图片
    makeUrlsAbsolute(clone);

    const html = '<!DOCTYPE html>\n' + clone.outerHTML;
    const filename = `${document.title || 'translated-page'}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    log(`导出成功: ${filename} (${(blob.size / 1024).toFixed(1)} KB)`);

    const status = document.querySelector('.__translator_status');
    if (status) {
      status.textContent = '导出成功，请查看浏览器下载';
      status.className = '__translator_status';
      setTimeout(() => {
        status.textContent = '';
        status.className = '__translator_status';
      }, 3000);
    }
  } catch (err) {
    log('导出失败:', err);
    bar.setError('导出失败，请重试');
  }
}

/** 将克隆 DOM 中的相对 URL 转为绝对 URL */
function makeUrlsAbsolute(root: HTMLElement): void {
  const base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
  const urlAttrs: Record<string, string[]> = {
    link: ['href'],
    img: ['src', 'srcset'],
    script: ['src'],
    a: ['href'],
    source: ['src', 'srcset'],
  };

  for (const [tag, attrs] of Object.entries(urlAttrs)) {
    const els = root.querySelectorAll(tag);
    for (const el of els) {
      for (const attr of attrs) {
        const val = el.getAttribute(attr);
        if (val && !val.startsWith('http') && !val.startsWith('data:') && !val.startsWith('//')) {
          try {
            el.setAttribute(attr, new URL(val, location.href).href);
          } catch {
            // 无法解析的 URL 保持原样
          }
        }
      }
    }
  }

  // 处理 style 标签中的 url() 引用
  const styleEls = root.querySelectorAll('style');
  for (const el of styleEls) {
    const text = el.textContent;
    if (text) {
      el.textContent = text.replace(
        /url\(["']?([^)"']+)["']?\)/g,
        (_match, path: string) => {
          if (path.startsWith('http') || path.startsWith('data:')) return `url(${path})`;
          try {
            return `url(${new URL(path, location.href).href})`;
          } catch {
            return `url(${path})`;
          }
        },
      );
    }
  }

  log('URL 转换完成');
}

async function clearTranslation(): Promise<void> {
  log('=== 清除翻译 ===');
  translationCache.clear();
  // 全面清理：移除翻译元素 + 恢复原文 + 清除 data-trans-id
  restoreOriginal(document.body);
  // 额外清除 data-trans-id（restoreOriginal 现在保留它给模式切换，清除时需手动移除）
  const marked = document.querySelectorAll('[data-trans-id]');
  for (const el of marked) el.removeAttribute('data-trans-id');
  const originals = document.querySelectorAll('[data-trans-original]');
  for (const el of originals) el.removeAttribute('data-trans-original');

  textBlocks = extractTextBlocks(document.body);
  log(`重新提取到 ${textBlocks.length} 个文本块`);

  if (sessionId) {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.CLEAR_SESSION,
      sessionId,
    });
    log('会话已清除:', sessionId);
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
    scheduleCheck();
  };
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    scheduleCheck();
  };

  window.addEventListener('popstate', scheduleCheck);
  window.addEventListener('hashchange', scheduleCheck);

  const pollInterval = setInterval(checkUrlChange, 500);

  window.addEventListener('beforeunload', () => {
    clearInterval(pollInterval);
    log('页面卸载，清理导航监听');
  });

  let checkTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleCheck(): void {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(checkUrlChange, 100);
  }

  function checkUrlChange(): void {
    if (location.href !== lastUrl) {
      log(`检测到 URL 变化: ${lastUrl} → ${location.href}`);
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
