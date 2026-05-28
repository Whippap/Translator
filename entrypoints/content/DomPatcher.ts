import type { TextBlock, TranslatedBlock } from '../../core/types';

export function applyTranslation(
  root: Element,
  textBlocks: TextBlock[],
  translations: TranslatedBlock[],
  mode: 'bilingual' | 'translation-only',
): void {
  const translationMap = new Map(translations.map(t => [t.id, t.text]));

  for (const block of textBlocks) {
    const translated = translationMap.get(block.id);
    if (!translated) {
      console.warn(`[Translator] 未找到 ${block.id} 的翻译结果`);
      continue;
    }

    const parent = root.querySelector(`[data-trans-id="${block.id}"]`);
    if (!parent) {
      console.warn(`[Translator] 未找到 data-trans-id="${block.id}" 的 DOM 元素`);
      continue;
    }

    if (mode === 'translation-only') {
      console.log(`[Translator] 纯译文模式: 替换 ${block.id} → "${translated.slice(0, 30)}..."`);
      replaceTextContent(parent, translated);
    } else {
      console.log(`[Translator] 英汉对照: 追加 ${block.id} → "${translated.slice(0, 30)}..."`);
      insertTranslationSpan(parent, block.id, translated);
    }
  }
}

function replaceTextContent(parent: Element, translatedText: string): void {
  // 保存原文以便后续恢复
  if (!parent.hasAttribute('data-trans-original')) {
    parent.setAttribute('data-trans-original', parent.innerHTML);
  }

  // 检查是否有嵌套的子翻译块，避免 innerHTML 摧毁它们
  const childBlocks = parent.querySelectorAll('[data-trans-id]');
  if (childBlocks.length > 0) {
    // 仅替换直接文本节点，保留子元素（含其翻译）
    for (let i = parent.childNodes.length - 1; i >= 0; i--) {
      const child = parent.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        child.remove();
      }
    }
    const span = document.createElement('span');
    span.className = '__translator_replaced';
    span.innerHTML = translatedText;
    parent.insertBefore(span, parent.firstChild);
  } else {
    // 无嵌套翻译块，安全替换整个内容
    parent.innerHTML = translatedText;
  }
}

function insertTranslationSpan(
  parent: Element,
  id: string,
  translated: string,
): void {
  const existing = parent.querySelector(
    `.__translator_text[data-trans-id="${id}"]`,
  );
  if (existing) {
    existing.innerHTML = translated;
    return;
  }

  // 译文前插入换行，方便阅读
  const br = document.createElement('br');
  br.className = '__translator_br';
  br.setAttribute('data-trans-id', id);
  parent.appendChild(br);

  const span = document.createElement('span');
  span.className = '__translator_text';
  span.setAttribute('data-trans-id', id);
  span.innerHTML = translated;
  parent.appendChild(span);
}

/**
 * 从 DOM 中移除所有翻译相关元素并恢复原文。
 * 保留块级元素上的 data-trans-id，供模式切换时重新定位使用。
 */
export function restoreOriginal(root: Element): void {
  // 移除翻译插入的 span、换行 br、以及直接文本替换的 span
  const inserted = root.querySelectorAll('.__translator_text, .__translator_br, .__translator_replaced');
  console.log(`[Translator] restoreOriginal: 移除 ${inserted.length} 个翻译插入元素`);
  for (const el of inserted) {
    el.remove();
  }

  // 恢复纯译文模式下被替换的原文。
  // 关键：按文档顺序处理（父 → 子），父元素恢复 innerHTML 后会重建子元素，
  // 此时跳过子元素的单独恢复，避免操作已脱离 DOM 的旧元素。
  const replaced = root.querySelectorAll('[data-trans-original]');
  const restoredParents = new WeakSet<Element>();
  console.log(`[Translator] restoreOriginal: 恢复 ${replaced.length} 个纯译文替换元素`);

  for (const el of replaced) {
    // 检查当前元素是否仍在 DOM 中（可能已被父元素 innerHTML 重建替换了）
    if (!root.contains(el)) continue;

    el.innerHTML = el.getAttribute('data-trans-original')!;
    el.removeAttribute('data-trans-original');
    restoredParents.add(el);
  }
}
