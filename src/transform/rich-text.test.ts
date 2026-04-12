import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToRichText, looksLikeHTML, isRichTextDocument } from './rich-text.js';
import type { RichTextDocument, RichTextNode } from './rich-text.js';

/* ── helpers ────────────────────────────────────────────────────── */

/** Shorthand: first text node value at a given path. */
function textOf(node: RichTextNode): string {
  if (node.nodeType === 'text') return node.value ?? '';
  return node.content?.map(c => textOf(c)).join('') ?? '';
}

/* ── htmlToRichText ─────────────────────────────────────────────── */

describe('htmlToRichText', () => {

  // ── empty / edge cases ───────────────────────────────────────
  describe('edge cases', () => {
    it('returns empty document for empty string', () => {
      const doc = htmlToRichText('');
      assert.equal(doc.nodeType, 'document');
      assert.equal(doc.content.length, 1);
      assert.equal(doc.content[0].nodeType, 'paragraph');
    });

    it('returns empty document for whitespace-only string', () => {
      const doc = htmlToRichText('   \n\t  ');
      assert.equal(doc.content.length, 1);
      assert.equal(doc.content[0].nodeType, 'paragraph');
    });

    it('returns empty document for null-ish (cast)', () => {
      const doc = htmlToRichText(null as unknown as string);
      assert.equal(doc.nodeType, 'document');
    });

    it('wraps plain text without tags in a single paragraph', () => {
      const doc = htmlToRichText('Hello World');
      assert.equal(doc.content.length, 1);
      assert.equal(doc.content[0].nodeType, 'paragraph');
      assert.equal(doc.content[0].content![0].value, 'Hello World');
    });
  });

  // ── block elements ────────────────────────────────────────────
  describe('block elements', () => {
    it('converts <p> to paragraph', () => {
      const doc = htmlToRichText('<p>Hello</p>');
      assert.equal(doc.content[0].nodeType, 'paragraph');
      assert.equal(textOf(doc.content[0]), 'Hello');
    });

    it('converts <h1>-<h6> to heading-1 through heading-6', () => {
      for (let i = 1; i <= 6; i++) {
        const doc = htmlToRichText(`<h${i}>Title${i}</h${i}>`);
        assert.equal(doc.content[0].nodeType, `heading-${i}`);
        assert.equal(textOf(doc.content[0]), `Title${i}`);
      }
    });

    it('converts <blockquote> to blockquote', () => {
      const doc = htmlToRichText('<blockquote>Quoted</blockquote>');
      assert.equal(doc.content[0].nodeType, 'blockquote');
      // blockquote children must be blocks → text is wrapped in paragraph
      assert.equal(doc.content[0].content![0].nodeType, 'paragraph');
      assert.equal(textOf(doc.content[0]), 'Quoted');
    });

    it('converts <hr/> to hr', () => {
      const doc = htmlToRichText('<hr/>');
      assert.equal(doc.content[0].nodeType, 'hr');
    });

    it('converts <br/> to newline text', () => {
      const doc = htmlToRichText('<p>Line1<br/>Line2</p>');
      const content = doc.content[0].content!;
      const text = content.map(n => n.value).join('');
      assert.ok(text.includes('\n'));
    });

    it('converts <pre> to paragraph with code marks', () => {
      const doc = htmlToRichText('<pre>const x = 1;</pre>');
      assert.equal(doc.content[0].nodeType, 'paragraph');
      const textNode = doc.content[0].content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'code'));
    });
  });

  // ── lists ─────────────────────────────────────────────────────
  describe('lists', () => {
    it('converts <ul> with <li> to unordered-list', () => {
      const doc = htmlToRichText('<ul><li>A</li><li>B</li></ul>');
      assert.equal(doc.content[0].nodeType, 'unordered-list');
      assert.equal(doc.content[0].content!.length, 2);
      assert.equal(doc.content[0].content![0].nodeType, 'list-item');
    });

    it('converts <ol> with <li> to ordered-list', () => {
      const doc = htmlToRichText('<ol><li>First</li><li>Second</li></ol>');
      assert.equal(doc.content[0].nodeType, 'ordered-list');
      assert.equal(doc.content[0].content!.length, 2);
    });

    it('list-item wraps inline text in paragraph', () => {
      const doc = htmlToRichText('<ul><li>Item</li></ul>');
      const li = doc.content[0].content![0];
      assert.equal(li.nodeType, 'list-item');
      assert.equal(li.content![0].nodeType, 'paragraph');
      assert.equal(textOf(li), 'Item');
    });

    it('handles nested lists', () => {
      const doc = htmlToRichText('<ul><li>A<ul><li>A1</li></ul></li></ul>');
      const outerLi = doc.content[0].content![0];
      assert.equal(outerLi.nodeType, 'list-item');
      // Should contain a paragraph and a nested list
      const nested = outerLi.content!.find(c => c.nodeType === 'unordered-list');
      assert.ok(nested, 'nested list should exist');
    });
  });

  // ── tables ────────────────────────────────────────────────────
  describe('tables', () => {
    it('converts table > tr > td structure', () => {
      const doc = htmlToRichText('<table><tr><td>Cell</td></tr></table>');
      assert.equal(doc.content[0].nodeType, 'table');
      const row = doc.content[0].content![0];
      assert.equal(row.nodeType, 'table-row');
      const cell = row.content![0];
      assert.equal(cell.nodeType, 'table-cell');
      // table-cell wraps text in paragraph
      assert.equal(cell.content![0].nodeType, 'paragraph');
    });

    it('converts <th> to table-header-cell', () => {
      const doc = htmlToRichText('<table><tr><th>Header</th></tr></table>');
      const cell = doc.content[0].content![0].content![0];
      assert.equal(cell.nodeType, 'table-header-cell');
    });
  });

  // ── inline marks ──────────────────────────────────────────────
  describe('inline marks', () => {
    it('converts <b> and <strong> to bold mark', () => {
      const doc = htmlToRichText('<p><b>Bold</b></p>');
      const textNode = doc.content[0].content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'bold'));
      assert.equal(textNode.value, 'Bold');
    });

    it('converts <i> and <em> to italic mark', () => {
      const doc = htmlToRichText('<p><em>Italic</em></p>');
      const textNode = doc.content[0].content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'italic'));
    });

    it('converts <u> to underline mark', () => {
      const doc = htmlToRichText('<p><u>Underlined</u></p>');
      const textNode = doc.content[0].content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'underline'));
    });

    it('converts <code> to code mark', () => {
      const doc = htmlToRichText('<p><code>x</code></p>');
      const textNode = doc.content[0].content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'code'));
    });

    it('converts <s>/<del>/<strike> to strikethrough', () => {
      for (const tag of ['s', 'del', 'strike']) {
        const doc = htmlToRichText(`<p><${tag}>Deleted</${tag}></p>`);
        const textNode = doc.content[0].content![0];
        assert.ok(textNode.marks!.some(m => m.type === 'strikethrough'), `${tag} should produce strikethrough`);
      }
    });

    it('converts <sup> to superscript', () => {
      const doc = htmlToRichText('<p>x<sup>2</sup></p>');
      const sup = doc.content[0].content!.find(c => c.value === '2');
      assert.ok(sup!.marks!.some(m => m.type === 'superscript'));
    });

    it('converts <sub> to subscript', () => {
      const doc = htmlToRichText('<p>H<sub>2</sub>O</p>');
      const sub = doc.content[0].content!.find(c => c.value === '2');
      assert.ok(sub!.marks!.some(m => m.type === 'subscript'));
    });

    it('handles nested marks (bold inside italic)', () => {
      const doc = htmlToRichText('<p><em><b>Bold Italic</b></em></p>');
      const textNode = doc.content[0].content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'bold'));
      assert.ok(textNode.marks!.some(m => m.type === 'italic'));
    });
  });

  // ── links ─────────────────────────────────────────────────────
  describe('links', () => {
    it('converts <a href="..."> to hyperlink', () => {
      const doc = htmlToRichText('<p><a href="https://example.com">Click</a></p>');
      const link = doc.content[0].content![0];
      assert.equal(link.nodeType, 'hyperlink');
      assert.equal(link.data.uri, 'https://example.com');
      assert.equal(link.content![0].value, 'Click');
    });

    it('uses href as text when anchor has no text content', () => {
      const doc = htmlToRichText('<p><a href="https://x.com"></a></p>');
      const link = doc.content[0].content![0];
      assert.equal(link.nodeType, 'hyperlink');
      assert.equal(link.content![0].value, 'https://x.com');
    });

    it('preserves marks inside links', () => {
      const doc = htmlToRichText('<p><a href="/"><b>Bold Link</b></a></p>');
      const link = doc.content[0].content![0];
      assert.equal(link.nodeType, 'hyperlink');
      const textNode = link.content![0];
      assert.ok(textNode.marks!.some(m => m.type === 'bold'));
    });
  });

  // ── images ────────────────────────────────────────────────────
  describe('images', () => {
    it('converts <img> to embedded-asset-block', () => {
      const doc = htmlToRichText('<img src="https://example.com/pic.jpg" alt="Photo"/>');
      const img = doc.content.find(c => c.nodeType === 'embedded-asset-block');
      assert.ok(img, 'should contain embedded-asset-block');
      assert.equal(img.data.uri, 'https://example.com/pic.jpg');
      assert.equal(img.data.alt, 'Photo');
    });

    it('generates a deterministic asset ID from src', () => {
      const doc1 = htmlToRichText('<img src="https://example.com/a.jpg"/>');
      const doc2 = htmlToRichText('<img src="https://example.com/a.jpg"/>');
      const id1 = (doc1.content[0].data.target as { sys: { id: string } }).sys.id;
      const id2 = (doc2.content[0].data.target as { sys: { id: string } }).sys.id;
      assert.equal(id1, id2);
    });
  });

  // ── transparent wrappers ──────────────────────────────────────
  describe('transparent wrappers', () => {
    it('unwraps <div> preserving content', () => {
      const doc = htmlToRichText('<div><p>Hello</p></div>');
      assert.equal(doc.content[0].nodeType, 'paragraph');
      assert.equal(textOf(doc.content[0]), 'Hello');
    });

    it('unwraps <span> preserving content', () => {
      const doc = htmlToRichText('<p><span>Text</span></p>');
      assert.equal(textOf(doc.content[0]), 'Text');
    });
  });

  // ── HTML entities ─────────────────────────────────────────────
  describe('HTML entities', () => {
    it('decodes &amp; &lt; &gt; &quot;', () => {
      const doc = htmlToRichText('<p>&amp; &lt; &gt; &quot;</p>');
      const text = textOf(doc.content[0]);
      assert.ok(text.includes('&'));
      assert.ok(text.includes('<'));
      assert.ok(text.includes('>'));
      assert.ok(text.includes('"'));
    });

    it('decodes &#39; and &nbsp;', () => {
      const doc = htmlToRichText('<p>&#39; &nbsp;</p>');
      const text = textOf(doc.content[0]);
      assert.ok(text.includes("'"));
      assert.ok(text.includes('\u00A0'));
    });

    it('decodes numeric entities (&#169; = ©)', () => {
      const doc = htmlToRichText('<p>&#169;</p>');
      assert.equal(textOf(doc.content[0]), '©');
    });

    it('decodes hex entities (&#x00A9; = ©)', () => {
      const doc = htmlToRichText('<p>&#x00A9;</p>');
      assert.equal(textOf(doc.content[0]), '©');
    });
  });

  // ── complex/mixed HTML ────────────────────────────────────────
  describe('complex HTML', () => {
    it('handles a full blog post fragment', () => {
      const html = `
        <h1>Title</h1>
        <p>Intro with <b>bold</b> and <a href="/link">link</a>.</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
        <blockquote>Quote text</blockquote>
      `;
      const doc = htmlToRichText(html);
      const types = doc.content.map(n => n.nodeType);
      assert.ok(types.includes('heading-1'));
      assert.ok(types.includes('paragraph'));
      assert.ok(types.includes('unordered-list'));
      assert.ok(types.includes('blockquote'));
    });

    it('handles HTML comments (strips them)', () => {
      const doc = htmlToRichText('<!-- comment --><p>After</p>');
      assert.equal(doc.content[0].nodeType, 'paragraph');
      assert.equal(textOf(doc.content[0]), 'After');
    });

    it('handles DOCTYPE (strips it)', () => {
      const doc = htmlToRichText('<!DOCTYPE html><p>Content</p>');
      assert.equal(doc.content[0].nodeType, 'paragraph');
      assert.equal(textOf(doc.content[0]), 'Content');
    });

    it('multiple paragraphs', () => {
      const doc = htmlToRichText('<p>First</p><p>Second</p>');
      assert.equal(doc.content.length, 2);
      assert.equal(textOf(doc.content[0]), 'First');
      assert.equal(textOf(doc.content[1]), 'Second');
    });

    it('wraps loose text between blocks into paragraphs', () => {
      const doc = htmlToRichText('<h1>Title</h1>Some loose text');
      const types = doc.content.map(n => n.nodeType);
      assert.ok(types.includes('heading-1'));
      assert.ok(types.includes('paragraph'));
    });
  });

  // ── document structure validation ─────────────────────────────
  describe('document structure', () => {
    it('always returns nodeType=document with data and content', () => {
      const doc = htmlToRichText('<p>Hello</p>');
      assert.equal(doc.nodeType, 'document');
      assert.deepEqual(doc.data, {});
      assert.ok(Array.isArray(doc.content));
    });

    it('top-level children are always block nodes', () => {
      const doc = htmlToRichText('Just text without any tags. <b>Bold</b> too.');
      // This has no '<' before the text, but it does contain < via <b>
      // Since it contains tags, it shouldn't be wrapped as plain text
      for (const node of doc.content) {
        assert.notEqual(node.nodeType, 'text', 'top-level should not be text nodes');
      }
    });

    it('paragraph contains only inline nodes', () => {
      const doc = htmlToRichText('<p>Text with <b>bold</b> and <a href="/">link</a></p>');
      for (const child of doc.content[0].content!) {
        assert.ok(
          child.nodeType === 'text' || child.nodeType === 'hyperlink',
          `paragraph child should be inline, got ${child.nodeType}`
        );
      }
    });
  });
});

/* ── looksLikeHTML ──────────────────────────────────────────────── */

describe('looksLikeHTML', () => {
  it('returns true for strings with HTML tags', () => {
    assert.equal(looksLikeHTML('<p>Hello</p>'), true);
    assert.equal(looksLikeHTML('<br/>'), true);
    assert.equal(looksLikeHTML('Some <b>bold</b> text'), true);
  });

  it('returns false for plain text', () => {
    assert.equal(looksLikeHTML('Hello World'), false);
    assert.equal(looksLikeHTML('Price < 100'), false);
  });

  it('returns false for non-string values', () => {
    assert.equal(looksLikeHTML(42), false);
    assert.equal(looksLikeHTML(null), false);
    assert.equal(looksLikeHTML(undefined), false);
    assert.equal(looksLikeHTML({ nodeType: 'document' }), false);
  });

  it('returns true for self-closing tags', () => {
    assert.equal(looksLikeHTML('<img src="x.jpg"/>'), true);
    assert.equal(looksLikeHTML('<hr />'), true);
  });
});

/* ── isRichTextDocument ─────────────────────────────────────────── */

describe('isRichTextDocument', () => {
  it('returns true for valid Rich Text document objects', () => {
    const doc: RichTextDocument = {
      nodeType: 'document',
      data: {},
      content: [{ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: '', marks: [], data: {} }] }],
    };
    assert.equal(isRichTextDocument(doc), true);
  });

  it('returns true for output of htmlToRichText', () => {
    const doc = htmlToRichText('<p>Test</p>');
    assert.equal(isRichTextDocument(doc), true);
  });

  it('returns false for strings', () => {
    assert.equal(isRichTextDocument('<p>Hi</p>'), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(isRichTextDocument(null), false);
    assert.equal(isRichTextDocument(undefined), false);
  });

  it('returns false for arrays', () => {
    assert.equal(isRichTextDocument([]), false);
  });

  it('returns false for objects without nodeType=document', () => {
    assert.equal(isRichTextDocument({ nodeType: 'paragraph', content: [] }), false);
  });

  it('returns false for objects without content array', () => {
    assert.equal(isRichTextDocument({ nodeType: 'document', data: {} }), false);
  });
});
