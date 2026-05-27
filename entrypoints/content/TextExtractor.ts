import { type TextBlock, MAX_TEXT_BLOCKS } from '../../core/types';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'CODE', 'PRE', 'IMG',
  'NOSCRIPT', 'IFRAME', 'SVG', 'TEXTAREA', 'INPUT',
  'HEADER', 'FOOTER', 'NAV',
]);

/** 跳过翻译的 CSS 选择器（页头/页脚/导航/插件控制条） */
const SKIP_SELECTORS = [
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="navigation"]',
  '.__translator_bar',
  '.header',
  '.footer',
  '.navbar',
  '.site-header',
  '.site-footer',
  '.page-header',
  '.page-footer',
  '#header',
  '#footer',
  '#navbar',
];

function shouldSkipElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  for (const sel of SKIP_SELECTORS) {
    if (el.matches(sel)) return true;
  }
  return false;
}
const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TD', 'TH', 'DIV', 'SECTION', 'ARTICLE',
  'MAIN', 'ASIDE', 'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD',
  'SUMMARY', 'LABEL', 'LEGEND', 'BUTTON',
]);

function shouldSkipAncestor(node: Node, root: Element): boolean {
  let ancestor: Node | null = node.parentNode;
  while (ancestor && ancestor !== root) {
    if (ancestor.nodeType === Node.ELEMENT_NODE) {
      if (shouldSkipElement(ancestor as Element)) return true;
    }
    ancestor = ancestor.parentNode;
  }
  return false;
}

function findBlockParent(node: Node): Element | null {
  let current: Node | null = node;
  while (current && current.nodeType === Node.TEXT_NODE) {
    current = current.parentNode;
  }
  if (current && current.nodeType === Node.ELEMENT_NODE) {
    const el = current as Element;
    if (BLOCK_TAGS.has(el.tagName)) return el;
    // 往上查找到第一个块级祖先
    let ancestor: Element | null = el.parentElement;
    while (ancestor) {
      if (BLOCK_TAGS.has(ancestor.tagName)) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return el; // 兜底：返回最近的元素父节点
  }
  return null;
}

export function extractTextBlocks(root: Element): TextBlock[] {
  const blocks: TextBlock[] = [];
  const blockMap = new Map<Element, string[]>();
  let nextId = 1;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node: Node | null = walker.nextNode();
  while (node) {
    if (!shouldSkipAncestor(node, root)) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      if (text && text.length > 0) {
        const blockParent = findBlockParent(node);
        if (blockParent && !shouldSkipElement(blockParent)) {
          const existing = blockMap.get(blockParent);
          if (existing) {
            existing.push(text);
          } else if (blockMap.size < MAX_TEXT_BLOCKS) {
            blockMap.set(blockParent, [text]);
          }
        }
      }
    }

    node = walker.nextNode();
  }

  // 输出为 TextBlock 并标记 DOM
  for (const [element, texts] of blockMap) {
    const id = `b${nextId++}`;
    // 避免重复标记
    if (!element.hasAttribute('data-trans-id')) {
      element.setAttribute('data-trans-id', id);
    }
    blocks.push({
      id,
      text: texts.join(' '),
      parentSelector: getSelector(element),
    });
  }

  return blocks;
}

function getSelector(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `#${CSS.escape(element.id)}`;
  const classes = Array.from(element.classList)
    .map(c => `.${CSS.escape(c)}`)
    .join('');
  if (classes) return `${tag}${classes}`;
  return tag;
}
