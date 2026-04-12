import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWXR, generateScaffold, scaffoldFromWXR } from './wxr-scaffold.js';
import type { WXRResult } from './wxr-reader.js';

// ── Test Helpers ─────────────────────────────────────────────────

function makeWXR(docs: Array<{ contentType: string; data: Record<string, unknown> }>): WXRResult {
  return {
    site: { title: 'Test Blog', url: 'https://test.example.com', language: 'en', description: 'A test blog' },
    documents: docs.map((d, i) => ({
      contentType: d.contentType,
      locale: 'en',
      path: `/${d.contentType}-${i}`,
      data: d.data,
    })),
  };
}

// ── analyzeWXR ──────────────────────────────────────────────────

describe('analyzeWXR', () => {
  it('discovers content types from documents', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello', slug: 'hello', body: '<p>World</p>' } },
      { contentType: 'post', data: { title: 'Second', slug: 'second', body: '<p>Post</p>' } },
      { contentType: 'author', data: { login: 'alice', displayName: 'Alice', email: 'a@b.com' } },
    ]);

    const analysis = analyzeWXR(wxr);
    assert.equal(analysis.contentTypes.length, 2);
    assert.equal(analysis.contentTypes[0].sourceType, 'post');
    assert.equal(analysis.contentTypes[0].contentfulId, 'blogPost');
    assert.equal(analysis.contentTypes[0].documentCount, 2);
    assert.equal(analysis.contentTypes[1].sourceType, 'author');
    assert.equal(analysis.contentTypes[1].contentfulId, 'author');
  });

  it('skips attachment and nav_menu_item types by default', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post' } },
      { contentType: 'attachment', data: { url: 'http://example.com/img.jpg' } },
      { contentType: 'nav_menu_item', data: { title: 'Home' } },
    ]);

    const analysis = analyzeWXR(wxr);
    assert.equal(analysis.contentTypes.length, 1);
    assert.equal(analysis.contentTypes[0].sourceType, 'post');
    assert.ok(analysis.skippedTypes.includes('attachment'));
    assert.ok(analysis.skippedTypes.includes('nav_menu_item'));
  });

  it('uses default type map (post → blogPost, page → page)', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post' } },
      { contentType: 'page', data: { title: 'Page' } },
      { contentType: 'category', data: { name: 'Cat', slug: 'cat' } },
      { contentType: 'tag', data: { name: 'Tag', slug: 'tag' } },
    ]);

    const analysis = analyzeWXR(wxr);
    const ids = analysis.contentTypes.map(ct => ct.contentfulId);
    assert.deepEqual(ids, ['blogPost', 'page', 'category', 'tag']);
  });

  it('supports custom type map', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post' } },
    ]);

    const analysis = analyzeWXR(wxr, { typeMap: { post: 'article' } });
    assert.equal(analysis.contentTypes[0].contentfulId, 'article');
  });

  it('supports custom skip types', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post' } },
      { contentType: 'page', data: { title: 'Page' } },
    ]);

    const analysis = analyzeWXR(wxr, { skipTypes: ['page'] });
    assert.equal(analysis.contentTypes.length, 1);
    assert.ok(analysis.skippedTypes.includes('page'));
  });

  it('infers field types from known field names', () => {
    const wxr = makeWXR([
      {
        contentType: 'post',
        data: { title: 'Test', slug: 'test', body: '<p>HTML content</p>', publishDate: '2024-01-01T00:00:00Z', categories: ['tech'] },
      },
    ]);

    const analysis = analyzeWXR(wxr);
    const fields = analysis.contentTypes[0].fields;
    const byId = Object.fromEntries(fields.map(f => [f.id, f]));
    assert.equal(byId.title.type, 'Symbol');
    assert.equal(byId.slug.type, 'Symbol');
    assert.equal(byId.body.type, 'RichText');
    assert.equal(byId.publishDate.type, 'Date');
    assert.equal(byId.categories.type, 'Array');
  });

  it('marks fields as required when present in >50% of docs', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'A', slug: 'a', body: 'text', excerpt: 'ex' } },
      { contentType: 'post', data: { title: 'B', slug: 'b', body: 'text' } },
      { contentType: 'post', data: { title: 'C', slug: 'c', body: 'text' } },
    ]);

    const analysis = analyzeWXR(wxr);
    const fields = analysis.contentTypes[0].fields;
    const byId = Object.fromEntries(fields.map(f => [f.id, f]));
    assert.equal(byId.title.required, true);
    assert.equal(byId.excerpt.required, false); // only 1 of 3
  });

  it('expands meta fields when includeMeta is true (default)', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post', meta: { rating: '5', custom_field: 'value' } } },
    ]);

    const analysis = analyzeWXR(wxr);
    const fieldIds = analysis.contentTypes[0].fields.map(f => f.id);
    assert.ok(fieldIds.includes('metaRating'));
    assert.ok(fieldIds.includes('metaCustomField'));
  });

  it('skips meta fields when includeMeta is false', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post', meta: { rating: '5' } } },
    ]);

    const analysis = analyzeWXR(wxr, { includeMeta: false });
    const fieldIds = analysis.contentTypes[0].fields.map(f => f.id);
    assert.ok(!fieldIds.some(id => id.startsWith('meta')));
  });

  it('handles custom post types (e.g., product, event)', () => {
    const wxr = makeWXR([
      { contentType: 'product', data: { title: 'Widget', price: 19.99 } },
      { contentType: 'event', data: { title: 'Conference', date: '2024-06-15' } },
    ]);

    const analysis = analyzeWXR(wxr);
    assert.equal(analysis.contentTypes.length, 2);
    assert.equal(analysis.contentTypes[0].contentfulId, 'event');
    assert.equal(analysis.contentTypes[1].contentfulId, 'product');
  });

  it('infers Number type from numeric values', () => {
    const wxr = makeWXR([
      { contentType: 'product', data: { title: 'Item', price: 29.99 } },
      { contentType: 'product', data: { title: 'Other', price: 5.0 } },
    ]);

    const analysis = analyzeWXR(wxr);
    const fields = analysis.contentTypes[0].fields;
    const priceField = fields.find(f => f.id === 'price');
    assert.equal(priceField?.type, 'Number');
  });

  it('infers Boolean type from boolean values', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post', featured: true } },
      { contentType: 'post', data: { title: 'Other', featured: false } },
    ]);

    const analysis = analyzeWXR(wxr);
    const fields = analysis.contentTypes[0].fields;
    const featuredField = fields.find(f => f.id === 'featured');
    assert.equal(featuredField?.type, 'Boolean');
  });

  it('preserves site metadata', () => {
    const wxr = makeWXR([{ contentType: 'post', data: { title: 'X' } }]);
    const analysis = analyzeWXR(wxr);
    assert.equal(analysis.site.title, 'Test Blog');
    assert.equal(analysis.site.url, 'https://test.example.com');
    assert.equal(analysis.site.language, 'en');
  });

  it('sorts standard types before custom types', () => {
    const wxr = makeWXR([
      { contentType: 'product', data: { title: 'Widget' } },
      { contentType: 'category', data: { name: 'Cat', slug: 'cat' } },
      { contentType: 'post', data: { title: 'Post' } },
      { contentType: 'author', data: { login: 'bob', displayName: 'Bob' } },
    ]);

    const analysis = analyzeWXR(wxr);
    const order = analysis.contentTypes.map(ct => ct.sourceType);
    assert.deepEqual(order, ['post', 'author', 'category', 'product']);
  });
});

// ── generateScaffold ────────────────────────────────────────────

describe('generateScaffold', () => {
  it('generates schema files for each content type', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello', slug: 'hello', body: '<p>World</p>' } },
      { contentType: 'author', data: { login: 'alice', displayName: 'Alice' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);

    assert.ok(files.has('schemas/blogPost.js'));
    assert.ok(files.has('schemas/author.js'));
    assert.ok(files.has('transforms/wordpress.js'));
    assert.ok(files.has('README.md'));
  });

  it('schema file contains correct content type ID and fields', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello', slug: 'hello' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const schema = files.get('schemas/blogPost.js')!;

    assert.ok(schema.includes("id: 'blogPost'"));
    assert.ok(schema.includes("name: 'Blog Post'"));
    assert.ok(schema.includes("id: 'title'"));
    assert.ok(schema.includes("id: 'slug'"));
    assert.ok(schema.includes("type: 'Symbol'"));
  });

  it('schema file includes displayField', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post', slug: 'post' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const schema = files.get('schemas/blogPost.js')!;

    assert.ok(schema.includes("displayField: 'title'"));
  });

  it('transform file maps source type to contentful type', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello', slug: 'hello' } },
      { contentType: 'category', data: { name: 'Cat', slug: 'cat' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const transform = files.get('transforms/wordpress.js')!;

    assert.ok(transform.includes("transformers.register('post'"));
    assert.ok(transform.includes("contentType: 'blogPost'"));
    assert.ok(transform.includes("transformers.register('category'"));
    assert.ok(transform.includes("contentType: 'category'"));
  });

  it('transform file includes skip for skipped types', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello' } },
      { contentType: 'attachment', data: { url: 'http://x.com/a.jpg' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const transform = files.get('transforms/wordpress.js')!;

    assert.ok(transform.includes('transformers.skip('));
    assert.ok(transform.includes('attachment'));
  });

  it('transform file imports generateEntryId from the package', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const transform = files.get('transforms/wordpress.js')!;

    assert.ok(transform.includes("import { generateEntryId } from 'content-model-simulator'"));
  });

  it('README contains content type table', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'P1' } },
      { contentType: 'post', data: { title: 'P2' } },
      { contentType: 'author', data: { login: 'a' } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const readme = files.get('README.md')!;

    assert.ok(readme.includes('| post'));
    assert.ok(readme.includes('| blogPost'));
    assert.ok(readme.includes('| 2 |')); // 2 posts
    assert.ok(readme.includes('| author'));
  });

  it('schema file marks Array fields correctly', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Post', categories: ['tech', 'design'] } },
    ]);
    const analysis = analyzeWXR(wxr);
    const { files } = generateScaffold(analysis);
    const schema = files.get('schemas/blogPost.js')!;

    assert.ok(schema.includes("type: 'Array'"));
    assert.ok(schema.includes("items: { type: 'Symbol' }"));
  });
});

// ── scaffoldFromWXR (integration) ───────────────────────────────

describe('scaffoldFromWXR', () => {
  it('combines analysis and generation in one call', () => {
    const wxr = makeWXR([
      { contentType: 'post', data: { title: 'Hello', slug: 'hello', body: '<p>World</p>' } },
      { contentType: 'author', data: { login: 'alice', displayName: 'Alice' } },
      { contentType: 'category', data: { name: 'Tech', slug: 'tech' } },
      { contentType: 'attachment', data: { url: 'http://example.com/photo.jpg' } },
    ]);

    const { analysis, files } = scaffoldFromWXR(wxr);

    // Analysis
    assert.equal(analysis.contentTypes.length, 3); // post, author, category (no attachment)
    assert.ok(analysis.skippedTypes.includes('attachment'));

    // Files
    assert.equal(files.size, 5); // 3 schemas + 1 transform + 1 readme
    assert.ok(files.has('schemas/blogPost.js'));
    assert.ok(files.has('schemas/author.js'));
    assert.ok(files.has('schemas/category.js'));
    assert.ok(files.has('transforms/wordpress.js'));
    assert.ok(files.has('README.md'));
  });

  it('generates valid JS syntax in schema files', () => {
    const wxr = makeWXR([
      {
        contentType: 'post',
        data: {
          title: 'Test Post',
          slug: 'test-post',
          body: '<p>test</p>',
          excerpt: 'Short',
          publishDate: '2024-01-01T00:00:00Z',
          status: 'publish',
          categories: ['tech'],
          tags: ['js'],
        },
      },
    ]);

    const { files } = scaffoldFromWXR(wxr);
    const schema = files.get('schemas/blogPost.js')!;

    // Verify the JS has correct structure
    assert.ok(schema.includes('export default'));
    assert.ok(schema.includes("id: 'blogPost'"));
    assert.ok(schema.includes("id: 'title'"));
    assert.ok(schema.includes("id: 'body'"));
    assert.ok(schema.includes("type: 'RichText'"));
    assert.ok(schema.includes("type: 'Date'"));
    assert.ok(schema.includes("type: 'Array'"));
  });

  it('handles empty export gracefully', () => {
    const wxr: WXRResult = {
      site: { title: 'Empty', url: 'https://empty.com', language: 'en', description: '' },
      documents: [],
    };

    const { analysis, files } = scaffoldFromWXR(wxr);
    assert.equal(analysis.contentTypes.length, 0);
    assert.ok(files.has('transforms/wordpress.js'));
    assert.ok(files.has('README.md'));
  });
});
