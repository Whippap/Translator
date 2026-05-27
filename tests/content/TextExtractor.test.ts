import { describe, it, expect } from 'vitest';
import { extractTextBlocks } from '../../entrypoints/content/TextExtractor';
import { MAX_TEXT_BLOCKS } from '../../core/types';

function createTestDocument(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(
    `<!DOCTYPE html><html><head></head><body>${html}</body></html>`,
    'text/html',
  );
}

describe('extractTextBlocks', () => {
  it('extracts text from a single paragraph', () => {
    const doc = createTestDocument('<p>Hello world</p>');
    const blocks = extractTextBlocks(doc.body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('Hello world');
    expect(blocks[0].id).toBe('b1');
  });

  it('extracts text from multiple block-level elements', () => {
    const doc = createTestDocument('<p>First</p><p>Second</p><h1>Title</h1>');
    const blocks = extractTextBlocks(doc.body);
    expect(blocks).toHaveLength(3);
  });

  it('skips <script> elements', () => {
    const doc = createTestDocument('<p>Visible</p><script>console.log("hidden")</script><p>Also</p>');
    const blocks = extractTextBlocks(doc.body);
    const combined = blocks.map(b => b.text).join(' ');
    expect(combined).not.toContain('console.log');
  });

  it('skips <style> elements', () => {
    const doc = createTestDocument('<style>body{color:red}</style><p>Content</p>');
    const blocks = extractTextBlocks(doc.body);
    expect(blocks).toHaveLength(1);
  });

  it('skips <pre> blocks but includes inline <code>', () => {
    const doc = createTestDocument(
      '<p>Explain:</p><pre><code>const x=1</code></pre><p>Run <code>cmd</code> now</p>',
    );
    const blocks = extractTextBlocks(doc.body);
    const combined = blocks.map(b => b.text).join(' ');
    // <pre> 内的代码块应被跳过
    expect(combined).not.toContain('const x=1');
    // 行内 <code> 应保留并包裹在标签中
    expect(combined).toContain('<code>cmd</code>');
  });

  it('wraps inline <code> in tags for API translation', () => {
    const doc = createTestDocument(
      '<p>Run <code>create-next-app</code> to start</p>',
    );
    const blocks = extractTextBlocks(doc.body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('<code>create-next-app</code>');
    expect(blocks[0].text).toContain('Run');
    expect(blocks[0].text).toContain('to start');
  });

  it('skips <img> elements', () => {
    const doc = createTestDocument('<p>Text</p><img alt="skip me" src="t.png"><p>More</p>');
    const blocks = extractTextBlocks(doc.body);
    const combined = blocks.map(b => b.text).join(' ');
    expect(combined).not.toContain('skip me');
  });

  it('merges text nodes within the same block parent', () => {
    const doc = createTestDocument('<p>Hello <strong>world</strong> from <em>earth</em></p>');
    const blocks = extractTextBlocks(doc.body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toContain('Hello');
    expect(blocks[0].text).toContain('world');
  });

  it('sets data-trans-id on block parent elements', () => {
    const doc = createTestDocument('<p>First</p><p>Second</p>');
    extractTextBlocks(doc.body);
    const p1 = doc.querySelector('p');
    expect(p1?.getAttribute('data-trans-id')).toBe('b1');
  });

  it('truncates at MAX_TEXT_BLOCKS limit', () => {
    const paragraphs = Array.from(
      { length: MAX_TEXT_BLOCKS + 10 },
      (_, i) => `<p>Para ${i}</p>`,
    ).join('');
    const doc = createTestDocument(paragraphs);
    const blocks = extractTextBlocks(doc.body);
    expect(blocks.length).toBeLessThanOrEqual(MAX_TEXT_BLOCKS);
  });

  it('returns empty array for body with no text', () => {
    const doc = createTestDocument('<script>alert(1)</script><style>*{}</style>');
    const blocks = extractTextBlocks(doc.body);
    expect(blocks).toEqual([]);
  });
});
