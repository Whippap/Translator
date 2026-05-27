import { type TextBlock, MAX_TEXT_BLOCKS } from '../../core/types';

// 跳过整个子树的标签（代码块仍跳过，但行内 code 保留）
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'PRE', 'IMG',
  'NOSCRIPT', 'IFRAME', 'SVG', 'TEXTAREA', 'INPUT',
  'HEADER', 'FOOTER', 'NAV',
]);

// 行内标签：内容保留但包裹原始标签发送给 API
const INLINE_TAGS = new Set(['CODE', 'KBD', 'SAMP', 'VAR', 'TT']);

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

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TD', 'TH', 'DIV', 'SECTION', 'ARTICLE',
  'MAIN', 'ASIDE', 'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD',
  'SUMMARY', 'LABEL', 'LEGEND', 'BUTTON',
]);

function shouldSkipElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  for (const sel of SKIP_SELECTORS) {
    if (el.matches(sel)) return true;
  }
  return false;
}

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

function findNearestAncestorTag(node: Node, root: Element, tags: Set<string>): string | null {
  let ancestor: Node | null = node.parentNode;
  while (ancestor && ancestor !== root) {
    if (ancestor.nodeType === Node.ELEMENT_NODE) {
      if (tags.has((ancestor as Element).tagName)) {
        return (ancestor as Element).tagName.toLowerCase();
      }
    }
    ancestor = ancestor.parentNode;
  }
  return null;
}

function findBlockParent(node: Node): Element | null {
  let current: Node | null = node;
  while (current && current.nodeType === Node.TEXT_NODE) {
    current = current.parentNode;
  }
  if (current && current.nodeType === Node.ELEMENT_NODE) {
    const el = current as Element;
    if (BLOCK_TAGS.has(el.tagName)) return el;
    let ancestor: Element | null = el.parentElement;
    while (ancestor) {
      if (BLOCK_TAGS.has(ancestor.tagName)) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return el;
  }
  return null;
}

interface TextFragment {
  text: string;
  tag?: string; // 包裹标签名，如 "code"
}

export function extractTextBlocks(root: Element): TextBlock[] {
  const blocks: TextBlock[] = [];
  const blockMap = new Map<Element, TextFragment[]>();
  let nextId = 1;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node: Node | null = walker.nextNode();
  while (node) {
    if (!shouldSkipAncestor(node, root)) {
      const raw = node.textContent ?? '';
      const text = raw.replace(/\s+/g, ' ').trim();
      if (text.length > 0) {
        const blockParent = findBlockParent(node);
        if (blockParent && !shouldSkipElement(blockParent)) {
          // 检测是否在行内标签内
          const inlineTag = findNearestAncestorTag(node, root, INLINE_TAGS);
          const fragment: TextFragment = { text };
          if (inlineTag) {
            fragment.tag = inlineTag;
          }

          const existing = blockMap.get(blockParent);
          if (existing) {
            existing.push(fragment);
          } else if (blockMap.size < MAX_TEXT_BLOCKS) {
            blockMap.set(blockParent, [fragment]);
          }
        }
      }
    }
    node = walker.nextNode();
  }

  // 输出为 TextBlock，行内标签用 HTML 包裹
  for (const [element, fragments] of blockMap) {
    const id = `b${nextId++}`;
    if (!element.hasAttribute('data-trans-id')) {
      element.setAttribute('data-trans-id', id);
    }
    const text = fragments
      .map(f => f.tag ? `<${f.tag}>${f.text}</${f.tag}>` : f.text)
      .join(' ');
    blocks.push({
      id,
      text,
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
