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
    if (!translated) continue;

    const parent = root.querySelector(`[data-trans-id="${block.id}"]`);
    if (!parent) continue;

    if (mode === 'translation-only') {
      replaceTextContent(parent, translated);
    } else {
      insertTranslationSpan(parent, block.id, translated);
    }
  }
}

function replaceTextContent(parent: Element, translatedText: string): void {
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }

  const translationNode = document.createTextNode(translatedText);
  if (textNodes.length > 0) {
    parent.insertBefore(translationNode, textNodes[0]);
  } else {
    parent.appendChild(translationNode);
  }

  for (const tn of textNodes) {
    tn.remove();
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
    existing.textContent = translated;
    return;
  }

  const span = document.createElement('span');
  span.className = '__translator_text';
  span.setAttribute('data-trans-id', id);
  span.textContent = translated;
  parent.appendChild(span);
}

export function switchDisplayMode(
  root: Element,
  mode: 'bilingual' | 'translation-only',
): void {
  const spans = root.querySelectorAll('.__translator_text');
  for (const span of spans) {
    (span as HTMLElement).style.display =
      mode === 'bilingual' ? '' : 'none';
  }
}

export function restoreOriginal(root: Element): void {
  const spans = root.querySelectorAll('.__translator_text');
  for (const span of spans) {
    span.remove();
  }
  const marked = root.querySelectorAll('[data-trans-id]');
  for (const el of marked) {
    el.removeAttribute('data-trans-id');
  }
}
