import { describe, it, expect } from 'vitest';
import {
  applyTranslation,
  switchDisplayMode,
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

describe('switchDisplayMode', () => {
  it('hides translation spans when switching to translation-only', () => {
    const doc = createDoc(
      '<p>Hello<span class="__translator_text" data-trans-id="b1">你好</span></p>',
    );
    switchDisplayMode(doc.body, 'translation-only');
    const span = doc.querySelector('.__translator_text') as HTMLElement;
    expect(span.style.display).toBe('none');
  });

  it('shows translation spans when switching to bilingual', () => {
    const doc = createDoc(
      '<p>Hello<span class="__translator_text" style="display:none">你好</span></p>',
    );
    switchDisplayMode(doc.body, 'bilingual');
    const span = doc.querySelector('.__translator_text') as HTMLElement;
    expect(span.style.display).toBe('');
  });
});

describe('restoreOriginal', () => {
  it('removes all translation spans and data-trans-id', () => {
    const doc = createDoc(
      '<p data-trans-id="b1">Hello<span class="__translator_text">你好</span></p>',
    );
    restoreOriginal(doc.body);
    expect(doc.querySelector('.__translator_text')).toBeNull();
    expect(doc.querySelector('[data-trans-id]')).toBeNull();
  });
});
