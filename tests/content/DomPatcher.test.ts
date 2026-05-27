import { describe, it, expect } from 'vitest';
import {
  applyTranslation,
  restoreOriginal,
} from '../../entrypoints/content/DomPatcher';
import type { TextBlock, TranslatedBlock } from '../../core/types';

function createDoc(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    'text/html',
  );
}

describe('applyTranslation - bilingual mode', () => {
  it('inserts translation span after original text', () => {
    const doc = createDoc('<p data-trans-id="b1">Hello</p>');
    const textBlock: TextBlock = {
      id: 'b1',
      text: 'Hello',
      parentSelector: 'p',
    };
    const translated: TranslatedBlock = {
      id: 'b1',
      text: '你好',
      fromCache: false,
    };

    applyTranslation(doc.body, [textBlock], [translated], 'bilingual');

    const span = doc.querySelector('.__translator_text');
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe('你好');
  });
});

describe('applyTranslation - translation-only mode', () => {
  it('replaces original text with translation', () => {
    const doc = createDoc('<p data-trans-id="b1">Hello</p>');
    const textBlock: TextBlock = {
      id: 'b1',
      text: 'Hello',
      parentSelector: 'p',
    };
    const translated: TranslatedBlock = {
      id: 'b1',
      text: '你好',
      fromCache: false,
    };

    applyTranslation(doc.body, [textBlock], [translated], 'translation-only');

    const p = doc.querySelector('p');
    expect(p?.textContent).toBe('你好');
  });
});

describe('restoreOriginal', () => {
  it('removes translation spans but keeps data-trans-id on block elements', () => {
    const doc = createDoc(
      '<p data-trans-id="b1">Hello<span class="__translator_text">你好</span></p>',
    );
    restoreOriginal(doc.body);
    expect(doc.querySelector('.__translator_text')).toBeNull();
    // 块级元素上的 data-trans-id 保留（供模式切换用）
    expect(doc.querySelector('[data-trans-id]')).not.toBeNull();
  });

  it('restores elements replaced by translation-only mode', () => {
    const doc = createDoc(
      '<p data-trans-id="b1" data-trans-original="Hello <strong>world</strong>">你好</p>',
    );
    restoreOriginal(doc.body);
    const p = doc.querySelector('p')!;
    expect(p.innerHTML).toContain('Hello');
    expect(p.innerHTML).toContain('strong');
    expect(p.hasAttribute('data-trans-original')).toBe(false);
  });
});
