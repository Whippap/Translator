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
    onTranslate: () => startTranslation(false),
    onReTranslate: () => startTranslation(true),
    onToggleMode: toggleMode,
    onExport: exportHtml,
    onClear: clearTranslation,
  });
  bar.mount();
  log('浮动控制条已挂载');

  watchNavigation();
}

async function startTranslation(skipCache: boolean): Promise<void> {
  if (!bar) return;
  log(`=== 开始翻译 (skipCache=${skipCache}) ===`);

  const settings = await browser.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS });
  log('当前设置:', { apiKey: settings.apiKey ? '***' + settings.apiKey.slice(-4) : '(空)', engine: settings.engine, displayMode: settings.displayMode });

  if (!settings.apiKey) {
    bar.setError('请先在插件弹窗中配置 API Key');
    return;
  }

  currentMode = settings.displayMode || 'bilingual';
  log('翻译模式:', currentMode);
  bar.setMode(currentMode);

  // 每次翻译前重新提取文本块，确保 ID 与当前 DOM 一致
  textBlocks = extractTextBlocks(document.body);
  log(`提取到 ${textBlocks.length} 个文本块`);

  if (!sessionId) {
    sessionId = await browser.runtime.sendMessage({ type: 'create-session' });
    log('创建会话:', sessionId);
  }

  if (skipCache) {
    // 重新翻译时清除当前页面缓存
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.CLEAR_SESSION,
      sessionId,
    });
    sessionId = await browser.runtime.sendMessage({ type: 'create-session' });
  }

  translationCache.clear();

  const batches = chunkArray(textBlocks, BATCH_SIZE);
  log(`共 ${batches.length} 批次，每批 ${BATCH_SIZE} 个`);
  let totalCached = 0;

  for (let i = 0; i < batches.length; i++) {
    bar.setProgress(i + 1, batches.length);
    log(`发送第 ${i + 1}/${batches.length} 批 (${batches[i].length} 项)...`);
    try {
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.TRANSLATE_BATCH,
        items: batches[i],
        sessionId,
        skipCache,
      });
      log(`第 ${i + 1} 批返回 ${response.results.length} 条结果, 全部缓存命中: ${response.allCached}`);
      if (response.allCached) totalCached++;

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
  if (totalCached === batches.length && !skipCache) {
    bar.setDoneCached();
  } else {
    bar.setDone();
  }
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
  restoreOriginal(document.body);

  // 重新提取文本块，确保 data-trans-id 与当前 DOM 一致
  // （父元素 innerHTML 恢复后子元素被重建，旧 ID 引用可能失效）
  const freshBlocks = extractTextBlocks(document.body);

  // 按文本内容建立 旧ID→新ID 和 新ID→旧ID 双向映射
  const oldToNew = new Map<string, string>();
  const newToOld = new Map<string, string>();
  for (const oldBlock of textBlocks) {
    const match = freshBlocks.find(b => b.text === oldBlock.text);
    if (match) {
      oldToNew.set(oldBlock.id, match.id);
      newToOld.set(match.id, oldBlock.id);
    }
  }

  // 更新 textBlocks 为最新提取结果
  textBlocks = freshBlocks;

  // 按深度排序：子元素先处理
  const sorted = [...freshBlocks].sort((a, b) => {
    const elA = document.querySelector(`[data-trans-id="${a.id}"]`);
    const elB = document.querySelector(`[data-trans-id="${b.id}"]`);
    return (elB ? getDepth(elB) : 0) - (elA ? getDepth(elA) : 0);
  });

  // 预保存原文（translation-only 模式需要）
  if (currentMode === 'translation-only') {
    for (const block of sorted) {
      const el = document.querySelector(`[data-trans-id="${block.id}"]`);
      if (el && !el.hasAttribute('data-trans-original')) {
        el.setAttribute('data-trans-original', el.innerHTML);
      }
    }
  }

  let applied = 0;
  let skipped = 0;
  for (const block of sorted) {
    // 通过反向映射查找旧翻译缓存
    const oldId = newToOld.get(block.id);
    const translated = oldId ? translationCache.get(oldId) : undefined;
    if (!translated) continue;

    const el = document.querySelector(`[data-trans-id="${block.id}"]`);
    if (!el) {
      skipped++;
      continue;
    }
    applyTranslation(
      document.body,
      [block],
      [{ id: block.id, text: translated, fromCache: true }],
      currentMode,
    );
    applied++;
  }
  if (skipped > 0) log(`reapplyAllTranslations: 跳过 ${skipped} 个, 应用 ${applied} 个, 模式: ${currentMode}`);
  else log(`reapplyAllTranslations: 重新应用了 ${applied} 个翻译块, 模式: ${currentMode}`);
}

function getDepth(el: Element): number {
  let depth = 0;
  let current: Element | null = el;
  while (current) {
    depth++;
    current = current.parentElement;
  }
  return depth;
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

/** 将克隆 DOM 中的相对 URL 转为绝对 URL，并剥离图片优化代理 */
function makeUrlsAbsolute(root: HTMLElement): void {
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
        if (!val || val.startsWith('data:')) continue;

        let resolved: string;
        if (val.startsWith('http') || val.startsWith('//')) {
          resolved = val.startsWith('//') ? `https:${val}` : val;
        } else {
          try {
            resolved = new URL(val, location.href).href;
          } catch {
            continue;
          }
        }

        // 剥离 Next.js 图片优化代理: /_next/image?url=... → 直接引用原图
        if (tag === 'img') {
          resolved = stripImageProxy(resolved);
        }

        el.setAttribute(attr, resolved);
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

/**
 * 剥离图片优化代理层（Next.js /_next/image, Cloudflare /cdn-cgi/image 等）
 * 例: https://nextjs.org/_next/image?url=%2Fimg.png&w=384&q=75
 *   → https://nextjs.org/img.png
 */
function stripImageProxy(url: string): string {
  // Next.js: /_next/image?url=<encoded-url>
  const nextMatch = url.match(/\/_next\/image\?.*[?&]url=([^&]+)/);
  if (nextMatch) {
    const rawUrl = decodeURIComponent(nextMatch[1]);
    try {
      return new URL(rawUrl, url).href;
    } catch {
      return url;
    }
  }

  // Cloudflare: /cdn-cgi/image/<options>/<path>
  const cfMatch = url.match(/\/cdn-cgi\/image\/[^/]+\/(.+)$/);
  if (cfMatch) {
    try {
      return new URL(cfMatch[1], url).href;
    } catch {
      return url;
    }
  }

  // Nuxt/IPX: /_ipx/<params>/<path>
  const ipxMatch = url.match(/\/_ipx\/[^/]+\/(.+)$/);
  if (ipxMatch) {
    try {
      return new URL(ipxMatch[1], url).href;
    } catch {
      return url;
    }
  }

  return url;
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
      // 仅 hash 变化（页内锚点跳转）不重置翻译状态
      const currentBase = location.origin + location.pathname + location.search;
      const lastBase = lastUrl.replace(/#.*$/, '');
      if (currentBase !== lastBase) {
        log(`检测到页面变化: ${lastUrl} → ${location.href}`);
        clearTranslation();
      } else {
        log(`仅 hash 变化，跳过重置: ${lastUrl} → ${location.href}`);
      }
      lastUrl = location.href;
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
