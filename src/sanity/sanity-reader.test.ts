import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSanityString, portableTextToHTML, isSanityNDJSON } from './sanity-reader.js';
import type { SanityResult } from './sanity-reader.js';

// ── Minimal Sanity NDJSON fixture ────────────────────────────────

const MINIMAL_SANITY = [
  // System types (should be filtered)
  JSON.stringify({ _id: 'system-group-1', _type: 'system.group', _createdAt: '2025-01-01T00:00:00Z', _updatedAt: '2025-01-01T00:00:00Z', _rev: 'r1', grants: [], members: [] }),
  JSON.stringify({ _id: 'system-ret-1', _type: 'system.retention', _createdAt: '2025-01-01T00:00:00Z', _updatedAt: '2025-01-01T00:00:00Z', _rev: 'r2', days: 30 }),
  // Image asset
  JSON.stringify({ _id: 'image-abc123-800x600-jpg', _type: 'sanity.imageAsset', _createdAt: '2025-01-01T00:00:00Z', _updatedAt: '2025-01-01T00:00:00Z', _rev: 'r3', url: 'https://cdn.sanity.io/images/proj/dataset/abc123-800x600.jpg', originalFilename: 'hero.jpg', mimeType: 'image/jpeg', size: 50000, path: 'images/proj/dataset/abc123-800x600.jpg', assetId: 'abc123', extension: 'jpg' }),
  // Category
  JSON.stringify({ _id: 'cat-1', _type: 'category', _createdAt: '2025-01-01T00:00:00Z', _updatedAt: '2025-01-01T00:00:00Z', _rev: 'r4', title: 'Technology', slug: { _type: 'slug', current: 'technology' }, color: '#ff0000' }),
  // Post with Portable Text body and references
  JSON.stringify({
    _id: 'post-1', _type: 'post', _createdAt: '2025-03-01T10:00:00Z', _updatedAt: '2025-03-01T12:00:00Z', _rev: 'r5',
    title: 'Hello World',
    slug: { _type: 'slug', current: 'hello-world' },
    publishedAt: '2025-03-01T10:00:00Z',
    categories: [{ _ref: 'cat-1', _type: 'reference', _key: 'k1' }],
    mainImage: { _type: 'image', asset: { _ref: 'image-abc123-800x600-jpg', _type: 'reference' } },
    body: [
      { _key: 'b1', _type: 'block', style: 'normal', children: [{ _key: 's1', _type: 'span', text: 'Welcome to ', marks: [] }, { _key: 's2', _type: 'span', text: 'Sanity', marks: ['strong'] }], markDefs: [] },
      { _key: 'b2', _type: 'block', style: 'h2', children: [{ _key: 's3', _type: 'span', text: 'Getting Started', marks: [] }], markDefs: [] },
      { _key: 'b3', _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [{ _key: 's4', _type: 'span', text: 'Item one', marks: [] }], markDefs: [] },
      { _key: 'b4', _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [{ _key: 's5', _type: 'span', text: 'Item two', marks: [] }], markDefs: [] },
    ],
    excerpt: 'A short excerpt.',
  }),
  // Draft post (should be filtered by default)
  JSON.stringify({ _id: 'drafts.post-2', _type: 'post', _createdAt: '2025-03-02T00:00:00Z', _updatedAt: '2025-03-02T00:00:00Z', _rev: 'r6', title: 'Draft Post', slug: { _type: 'slug', current: 'draft-post' }, body: [] }),
  // Locale-aware document (localeString pattern)
  JSON.stringify({
    _id: 'feature-1', _type: 'feature', _createdAt: '2025-01-31T09:00:00Z', _updatedAt: '2025-01-31T09:00:00Z', _rev: 'r7',
    name: { _type: 'localeString', en: 'Power Battery', es: 'Potencia de batería' },
    icon: { _type: 'image', asset: { _ref: 'image-abc123-800x600-jpg', _type: 'reference' } },
  }),
  // Product (simple fields, no slug)
  JSON.stringify({ _id: 'product-1', _type: 'product', _createdAt: '2025-02-01T00:00:00Z', _updatedAt: '2025-02-01T00:00:00Z', _rev: 'r8', name: 'Widget', price: 9.99, link: 'https://example.com/widget' }),
  // Post with link annotation in Portable Text
  JSON.stringify({
    _id: 'post-3', _type: 'post', _createdAt: '2025-04-01T00:00:00Z', _updatedAt: '2025-04-01T00:00:00Z', _rev: 'r9',
    title: 'Link Test',
    slug: { _type: 'slug', current: 'link-test' },
    body: [
      { _key: 'b5', _type: 'block', style: 'normal', children: [{ _key: 's6', _type: 'span', text: 'Click ', marks: [] }, { _key: 's7', _type: 'span', text: 'here', marks: ['link1'] }], markDefs: [{ _key: 'link1', _type: 'link', href: 'https://example.com' }] },
    ],
  }),
].join('\n');

// ── parseSanityString ──────────────────────────────────────────

describe('parseSanityString', () => {

  let result: SanityResult;

  it('parses without error', () => {
    result = parseSanityString(MINIMAL_SANITY);
    assert.ok(result);
  });

  // ── Document count ─────────────────────────────────────────
  describe('document filtering', () => {
    it('excludes system types by default', () => {
      const systemDocs = result.documents.filter(d =>
        d.contentType.startsWith('system.')
      );
      assert.equal(systemDocs.length, 0);
    });

    it('excludes sanity.imageAsset from documents by default', () => {
      const assetDocs = result.documents.filter(d =>
        d.contentType === 'sanity.imageAsset'
      );
      assert.equal(assetDocs.length, 0);
    });

    it('excludes draft documents by default', () => {
      const drafts = result.documents.filter(d =>
        d.id?.startsWith('drafts.')
      );
      assert.equal(drafts.length, 0);
    });

    it('extracts correct number of documents', () => {
      // cat-1, post-1, feature-1, product-1, post-3 = 5
      assert.equal(result.documents.length, 5);
    });

    it('extracts correct content types', () => {
      const types = [...new Set(result.documents.map(d => d.contentType))].sort();
      assert.deepEqual(types, ['category', 'feature', 'post', 'product']);
    });
  });

  // ── Image assets ───────────────────────────────────────────
  describe('image asset collection', () => {
    it('collects image assets separately', () => {
      assert.equal(result.assets.length, 1);
    });

    it('parses asset fields', () => {
      const asset = result.assets[0];
      assert.equal(asset.id, 'image-abc123-800x600-jpg');
      assert.equal(asset.url, 'https://cdn.sanity.io/images/proj/dataset/abc123-800x600.jpg');
      assert.equal(asset.originalFilename, 'hero.jpg');
      assert.equal(asset.mimeType, 'image/jpeg');
      assert.equal(asset.size, 50000);
    });
  });

  // ── Category parsing ───────────────────────────────────────
  describe('category parsing', () => {
    it('extracts category with slug normalization', () => {
      const cat = result.documents.find(d => d.contentType === 'category');
      assert.ok(cat);
      assert.equal(cat.id, 'cat-1');
      assert.equal(cat.data!.title, 'Technology');
      assert.equal(cat.data!.slug, 'technology'); // slug object → string
      assert.equal(cat.data!.color, '#ff0000');
    });

    it('sets path from slug', () => {
      const cat = result.documents.find(d => d.contentType === 'category');
      assert.equal(cat!.path, '/technology');
    });
  });

  // ── Post parsing ───────────────────────────────────────────
  describe('post parsing', () => {
    it('extracts post with correct fields', () => {
      const post = result.documents.find(d => d.id === 'post-1');
      assert.ok(post);
      assert.equal(post.contentType, 'post');
      assert.equal(post.data!.title, 'Hello World');
      assert.equal(post.data!.slug, 'hello-world');
      assert.equal(post.data!.publishedAt, '2025-03-01T10:00:00Z');
      assert.equal(post.data!.excerpt, 'A short excerpt.');
    });

    it('converts Portable Text body to HTML', () => {
      const post = result.documents.find(d => d.id === 'post-1');
      const body = post!.data!.body as string;
      assert.ok(body.includes('<p>Welcome to <strong>Sanity</strong></p>'));
      assert.ok(body.includes('<h2>Getting Started</h2>'));
      assert.ok(body.includes('<ul>'));
      assert.ok(body.includes('<li>Item one</li>'));
      assert.ok(body.includes('<li>Item two</li>'));
      assert.ok(body.includes('</ul>'));
    });

    it('keeps references as-is in data', () => {
      const post = result.documents.find(d => d.id === 'post-1');
      const cats = post!.data!.categories as Array<Record<string, unknown>>;
      assert.equal(cats.length, 1);
      assert.equal(cats[0]._ref, 'cat-1');
      assert.equal(cats[0]._type, 'reference');
    });

    it('keeps image reference as-is', () => {
      const post = result.documents.find(d => d.id === 'post-1');
      const img = post!.data!.mainImage as Record<string, unknown>;
      assert.equal(img._type, 'image');
      const asset = img.asset as Record<string, unknown>;
      assert.equal(asset._ref, 'image-abc123-800x600-jpg');
    });

    it('sets path from slug', () => {
      const post = result.documents.find(d => d.id === 'post-1');
      assert.equal(post!.path, '/hello-world');
    });

    it('strips _id prefix on drafts.* id', () => {
      const post = result.documents.find(d => d.id === 'post-1');
      assert.equal(post!.id, 'post-1');
    });
  });

  // ── Link annotations in Portable Text ──────────────────────
  describe('link annotations', () => {
    it('converts link marks to anchor tags', () => {
      const post = result.documents.find(d => d.id === 'post-3');
      const body = post!.data!.body as string;
      assert.ok(body.includes('<a href="https://example.com">here</a>'));
    });
  });

  // ── Locale-aware fields ────────────────────────────────────
  describe('localeString handling', () => {
    it('normalizes localeString to locale map', () => {
      const feature = result.documents.find(d => d.contentType === 'feature');
      assert.ok(feature);
      const name = feature.data!.name as Record<string, string>;
      assert.equal(name.en, 'Power Battery');
      assert.equal(name.es, 'Potencia de batería');
    });
  });

  // ── Product (no slug) ──────────────────────────────────────
  describe('documents without slug', () => {
    it('has no path when slug is absent', () => {
      const prod = result.documents.find(d => d.contentType === 'product');
      assert.ok(prod);
      assert.equal(prod.path, undefined);
      assert.equal(prod.data!.name, 'Widget');
      assert.equal(prod.data!.price, 9.99);
    });
  });

  // ── Options ────────────────────────────────────────────────
  describe('options', () => {
    it('includes drafts when includeDrafts is true', () => {
      const r = parseSanityString(MINIMAL_SANITY, { includeDrafts: true });
      const draftPost = r.documents.find(d => d.id === 'post-2');
      assert.ok(draftPost, 'draft post should be included');
      assert.equal(draftPost.data!.title, 'Draft Post');
    });

    it('includes system types when includeSystemTypes is true', () => {
      const r = parseSanityString(MINIMAL_SANITY, { includeSystemTypes: true });
      const systemDocs = r.documents.filter(d => d.contentType.startsWith('system.'));
      assert.equal(systemDocs.length, 2);
    });

    it('includes image assets as documents when includeAssets is true', () => {
      const r = parseSanityString(MINIMAL_SANITY, { includeAssets: true });
      const assetDocs = r.documents.filter(d => d.contentType === 'sanity.imageAsset');
      assert.equal(assetDocs.length, 1);
    });
  });
});

// ── portableTextToHTML ─────────────────────────────────────────

describe('portableTextToHTML', () => {
  it('renders a plain paragraph', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', children: [{ _type: 'span', text: 'Hello', marks: [] }], markDefs: [] },
    ]);
    assert.equal(html, '<p>Hello</p>');
  });

  it('renders headings', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const html = portableTextToHTML([
        { _type: 'block', style: `h${level}`, children: [{ _type: 'span', text: `Heading ${level}`, marks: [] }], markDefs: [] },
      ]);
      assert.equal(html, `<h${level}>Heading ${level}</h${level}>`);
    }
  });

  it('renders bullet list', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'A', marks: [] }], markDefs: [] },
      { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'B', marks: [] }], markDefs: [] },
    ]);
    assert.ok(html.includes('<ul>'));
    assert.ok(html.includes('<li>A</li>'));
    assert.ok(html.includes('<li>B</li>'));
    assert.ok(html.includes('</ul>'));
  });

  it('renders numbered list', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', listItem: 'number', level: 1, children: [{ _type: 'span', text: 'First', marks: [] }], markDefs: [] },
      { _type: 'block', style: 'normal', listItem: 'number', level: 1, children: [{ _type: 'span', text: 'Second', marks: [] }], markDefs: [] },
    ]);
    assert.ok(html.includes('<ol>'));
    assert.ok(html.includes('<li>First</li>'));
    assert.ok(html.includes('</ol>'));
  });

  it('renders inline marks (strong, em, code)', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', children: [
        { _type: 'span', text: 'bold', marks: ['strong'] },
        { _type: 'span', text: ' and ', marks: [] },
        { _type: 'span', text: 'italic', marks: ['em'] },
        { _type: 'span', text: ' and ', marks: [] },
        { _type: 'span', text: 'code', marks: ['code'] },
      ], markDefs: [] },
    ]);
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('<em>italic</em>'));
    assert.ok(html.includes('<code>code</code>'));
  });

  it('renders link annotations', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', children: [
        { _type: 'span', text: 'Visit ', marks: [] },
        { _type: 'span', text: 'Example', marks: ['lnk1'] },
      ], markDefs: [{ _key: 'lnk1', _type: 'link', href: 'https://example.com' }] },
    ]);
    assert.ok(html.includes('<a href="https://example.com">Example</a>'));
  });

  it('escapes HTML entities in text', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', children: [{ _type: 'span', text: '<script>alert("xss")</script>', marks: [] }], markDefs: [] },
    ]);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('closes list when switching to non-list block', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'normal', listItem: 'bullet', level: 1, children: [{ _type: 'span', text: 'Item', marks: [] }], markDefs: [] },
      { _type: 'block', style: 'normal', children: [{ _type: 'span', text: 'After list', marks: [] }], markDefs: [] },
    ]);
    assert.ok(html.includes('</ul>'));
    assert.ok(html.includes('<p>After list</p>'));
    // </ul> should come before <p>
    assert.ok(html.indexOf('</ul>') < html.indexOf('<p>After list</p>'));
  });

  it('handles empty blocks array', () => {
    const html = portableTextToHTML([]);
    assert.equal(html, '');
  });

  it('renders blockquote style', () => {
    const html = portableTextToHTML([
      { _type: 'block', style: 'blockquote', children: [{ _type: 'span', text: 'A quote', marks: [] }], markDefs: [] },
    ]);
    assert.equal(html, '<blockquote>A quote</blockquote>');
  });
});

// ── isSanityNDJSON ─────────────────────────────────────────────

describe('isSanityNDJSON', () => {
  it('returns true for Sanity NDJSON', () => {
    assert.equal(isSanityNDJSON('{"_id":"abc","_type":"post","title":"Hi"}\n'), true);
  });

  it('returns false for simulator NDJSON (has contentType)', () => {
    assert.equal(isSanityNDJSON('{"contentType":"post","id":"1","data":{}}\n'), false);
  });

  it('returns false for plain JSON array', () => {
    assert.equal(isSanityNDJSON('[{"id":"1"}]'), false);
  });

  it('returns false for empty content', () => {
    assert.equal(isSanityNDJSON(''), false);
    assert.equal(isSanityNDJSON('  \n  \n'), false);
  });

  it('returns false for malformed JSON without Sanity fields', () => {
    assert.equal(isSanityNDJSON('{not valid json}\n'), false);
  });

  it('returns true for truncated Sanity NDJSON (regex fallback)', () => {
    // Simulate a truncated first line (very long document)
    const truncated = '{"_createdAt":"2025-01-01T00:00:00Z","_id":"post-1","_rev":"r1","_type":"post","title":"A very long pos';
    assert.equal(isSanityNDJSON(truncated), true);
  });
});
