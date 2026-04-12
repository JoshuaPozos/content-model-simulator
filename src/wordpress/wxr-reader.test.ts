import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWXRString, stripGutenbergComments } from './wxr-reader.js';
import type { WXRResult } from './wxr-reader.js';

// ── Minimal WXR fixture ────────────────────────────────────────

const MINIMAL_WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:wp="http://wordpress.org/export/1.2/">
  <channel>
    <title>Test Site</title>
    <link>https://example.com</link>
    <description>A test blog</description>
    <language>en</language>
    <wp:wxr_version>1.2</wp:wxr_version>
    <wp:author>
      <wp:author_login>jdoe</wp:author_login>
      <wp:author_email>jdoe@example.com</wp:author_email>
      <wp:author_display_name><![CDATA[Jane Doe]]></wp:author_display_name>
      <wp:author_first_name><![CDATA[Jane]]></wp:author_first_name>
      <wp:author_last_name><![CDATA[Doe]]></wp:author_last_name>
    </wp:author>
    <wp:category>
      <wp:term_id>5</wp:term_id>
      <wp:category_nicename>tech</wp:category_nicename>
      <wp:category_parent/>
      <wp:cat_name><![CDATA[Technology]]></wp:cat_name>
    </wp:category>
    <wp:term>
      <wp:term_id>10</wp:term_id>
      <wp:term_taxonomy>post_tag</wp:term_taxonomy>
      <wp:term_slug>javascript</wp:term_slug>
      <wp:term_name><![CDATA[JavaScript]]></wp:term_name>
    </wp:term>
    <wp:term>
      <wp:term_id>11</wp:term_id>
      <wp:term_taxonomy>nav_menu</wp:term_taxonomy>
      <wp:term_slug>primary</wp:term_slug>
      <wp:term_name><![CDATA[Primary]]></wp:term_name>
    </wp:term>
    <item>
      <title>Hello World</title>
      <link>https://example.com/2024/01/hello-world/</link>
      <pubDate>Mon, 01 Jan 2024 12:00:00 +0000</pubDate>
      <dc:creator>jdoe</dc:creator>
      <wp:post_id>42</wp:post_id>
      <wp:post_date_gmt>2024-01-01 12:00:00</wp:post_date_gmt>
      <wp:post_name>hello-world</wp:post_name>
      <wp:status>publish</wp:status>
      <wp:post_type>post</wp:post_type>
      <content:encoded><![CDATA[<!-- wp:paragraph -->
<p>Welcome to <strong>WordPress</strong>.</p>
<!-- /wp:paragraph -->

<!-- wp:heading {"level":2} -->
<h2>Getting Started</h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul><li>Item one</li><li>Item two</li></ul>
<!-- /wp:list -->]]></content:encoded>
      <excerpt:encoded><![CDATA[A short excerpt.]]></excerpt:encoded>
      <category domain="category" nicename="tech"><![CDATA[Technology]]></category>
      <category domain="post_tag" nicename="javascript"><![CDATA[JavaScript]]></category>
      <wp:postmeta>
        <wp:meta_key>_edit_last</wp:meta_key>
        <wp:meta_value><![CDATA[1]]></wp:meta_value>
      </wp:postmeta>
      <wp:postmeta>
        <wp:meta_key>custom_field</wp:meta_key>
        <wp:meta_value><![CDATA[custom_value]]></wp:meta_value>
      </wp:postmeta>
    </item>
    <item>
      <title>About</title>
      <wp:post_id>10</wp:post_id>
      <wp:post_date_gmt>2024-01-05 08:00:00</wp:post_date_gmt>
      <wp:post_name>about</wp:post_name>
      <wp:status>publish</wp:status>
      <wp:post_type>page</wp:post_type>
      <content:encoded><![CDATA[<p>About this site.</p>]]></content:encoded>
      <excerpt:encoded><![CDATA[]]></excerpt:encoded>
      <dc:creator>jdoe</dc:creator>
    </item>
    <item>
      <title>hero-image</title>
      <wp:post_id>55</wp:post_id>
      <wp:post_name>hero-image</wp:post_name>
      <wp:status>inherit</wp:status>
      <wp:post_type>attachment</wp:post_type>
      <wp:attachment_url>https://example.com/wp-content/uploads/hero.jpg</wp:attachment_url>
      <content:encoded><![CDATA[]]></content:encoded>
      <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    </item>
  </channel>
</rss>`;

// ── parseWXRString ─────────────────────────────────────────────

describe('parseWXRString', () => {

  let result: WXRResult;

  // Parse once, test many
  it('parses without error', () => {
    result = parseWXRString(MINIMAL_WXR);
    assert.ok(result);
  });

  // ── Site metadata ──────────────────────────────────────────
  describe('site metadata', () => {
    it('extracts site title', () => {
      assert.equal(result.site.title, 'Test Site');
    });

    it('extracts site URL', () => {
      assert.equal(result.site.url, 'https://example.com');
    });

    it('extracts language', () => {
      assert.equal(result.site.language, 'en');
    });

    it('extracts description', () => {
      assert.equal(result.site.description, 'A test blog');
    });
  });

  // ── Document count ─────────────────────────────────────────
  describe('document extraction', () => {
    it('extracts all documents', () => {
      // 1 author + 1 category + 1 tag + 3 items = 6
      assert.equal(result.documents.length, 6);
    });

    it('extracts correct content types', () => {
      const types = result.documents.map(d => d.contentType).sort();
      assert.deepEqual(types, ['attachment', 'author', 'category', 'page', 'post', 'tag']);
    });
  });

  // ── Authors ────────────────────────────────────────────────
  describe('author parsing', () => {
    it('extracts author with correct fields', () => {
      const author = result.documents.find(d => d.contentType === 'author');
      assert.ok(author);
      assert.equal(author.data!.login, 'jdoe');
      assert.equal(author.data!.email, 'jdoe@example.com');
      assert.equal(author.data!.displayName, 'Jane Doe');
      assert.equal(author.data!.firstName, 'Jane');
      assert.equal(author.data!.lastName, 'Doe');
    });

    it('sets author path', () => {
      const author = result.documents.find(d => d.contentType === 'author');
      assert.equal(author!.path, '/_authors/jdoe');
    });

    it('sets locale from language tag', () => {
      const author = result.documents.find(d => d.contentType === 'author');
      assert.equal(author!.locale, 'en');
    });
  });

  // ── Categories ─────────────────────────────────────────────
  describe('category parsing', () => {
    it('extracts category with correct fields', () => {
      const cat = result.documents.find(d => d.contentType === 'category');
      assert.ok(cat);
      assert.equal(cat.data!.name, 'Technology');
      assert.equal(cat.data!.slug, 'tech');
      assert.equal(cat.data!.parent, null);
    });

    it('sets category path', () => {
      const cat = result.documents.find(d => d.contentType === 'category');
      assert.equal(cat!.path, '/_categories/tech');
    });
  });

  // ── Tags ───────────────────────────────────────────────────
  describe('tag parsing', () => {
    it('extracts post_tag terms as tags', () => {
      const tag = result.documents.find(d => d.contentType === 'tag');
      assert.ok(tag);
      assert.equal(tag.data!.name, 'JavaScript');
      assert.equal(tag.data!.slug, 'javascript');
    });

    it('does not extract nav_menu terms', () => {
      const navMenus = result.documents.filter(d =>
        d.contentType === 'tag' && d.data?.slug === 'primary'
      );
      assert.equal(navMenus.length, 0);
    });
  });

  // ── Posts ──────────────────────────────────────────────────
  describe('post parsing', () => {
    it('extracts post with correct fields', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      assert.ok(post);
      assert.equal(post.data!.title, 'Hello World');
      assert.equal(post.data!.slug, 'hello-world');
      assert.equal(post.data!.status, 'publish');
      assert.equal(post.data!.author, 'jdoe');
      assert.equal(post.data!.excerpt, 'A short excerpt.');
    });

    it('strips Gutenberg comments from body', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      const body = post!.data!.body as string;
      assert.ok(!body.includes('<!-- wp:'));
      assert.ok(!body.includes('<!-- /wp:'));
      assert.ok(body.includes('<p>Welcome to <strong>WordPress</strong>.</p>'));
      assert.ok(body.includes('<h2>Getting Started</h2>'));
      assert.ok(body.includes('<ul><li>Item one</li><li>Item two</li></ul>'));
    });

    it('converts date to ISO 8601', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      assert.equal(post!.data!.publishDate, '2024-01-01T12:00:00.000Z');
    });

    it('sets post ID', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      assert.equal(post!.id, '42');
    });

    it('sets post path from slug', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      assert.equal(post!.path, '/hello-world');
    });

    it('extracts inline categories', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      assert.deepEqual(post!.data!.categories, ['Technology']);
    });

    it('extracts inline tags', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      assert.deepEqual(post!.data!.tags, ['JavaScript']);
    });

    it('extracts non-internal postmeta', () => {
      const post = result.documents.find(d => d.contentType === 'post');
      const meta = post!.data!.meta as Record<string, string>;
      assert.equal(meta.custom_field, 'custom_value');
      assert.equal(meta._edit_last, undefined); // internal meta skipped
    });
  });

  // ── Pages ──────────────────────────────────────────────────
  describe('page parsing', () => {
    it('extracts page with contentType=page', () => {
      const page = result.documents.find(d => d.contentType === 'page');
      assert.ok(page);
      assert.equal(page.data!.title, 'About');
      assert.equal(page.data!.slug, 'about');
    });

    it('page body has no Gutenberg comments', () => {
      const page = result.documents.find(d => d.contentType === 'page');
      assert.equal(page!.data!.body, '<p>About this site.</p>');
    });
  });

  // ── Attachments ────────────────────────────────────────────
  describe('attachment parsing', () => {
    it('extracts attachment with URL and mimeType', () => {
      const att = result.documents.find(d => d.contentType === 'attachment');
      assert.ok(att);
      assert.equal(att.data!.title, 'hero-image');
      assert.equal(att.data!.url, 'https://example.com/wp-content/uploads/hero.jpg');
      assert.equal(att.data!.mimeType, 'image/jpeg');
    });

    it('attachment does not have categories/tags', () => {
      const att = result.documents.find(d => d.contentType === 'attachment');
      assert.equal(att!.data!.categories, undefined);
      assert.equal(att!.data!.tags, undefined);
    });
  });

  // ── Options ────────────────────────────────────────────────
  describe('options', () => {
    it('respects locale override', () => {
      const r = parseWXRString(MINIMAL_WXR, { locale: 'es' });
      assert.ok(r.documents.every(d => d.locale === 'es'));
    });

    it('detects locale from language tag (e.g. en-US → en)', () => {
      const xml = MINIMAL_WXR.replace('<language>en</language>', '<language>fr-FR</language>');
      const r = parseWXRString(xml);
      assert.ok(r.documents.every(d => d.locale === 'fr'));
    });

    it('defaults to en when no language tag', () => {
      const xml = MINIMAL_WXR.replace('<language>en</language>', '');
      const r = parseWXRString(xml);
      assert.ok(r.documents.every(d => d.locale === 'en'));
    });
  });
});

// ── stripGutenbergComments ─────────────────────────────────────

describe('stripGutenbergComments', () => {
  it('strips opening and closing block comments', () => {
    const html = '<!-- wp:paragraph -->\n<p>Hello</p>\n<!-- /wp:paragraph -->';
    assert.equal(stripGutenbergComments(html), '<p>Hello</p>');
  });

  it('strips comments with JSON attributes', () => {
    const html = '<!-- wp:heading {"level":3} -->\n<h3>Title</h3>\n<!-- /wp:heading -->';
    assert.equal(stripGutenbergComments(html), '<h3>Title</h3>');
  });

  it('strips comments with complex JSON', () => {
    const html = '<!-- wp:image {"id":80,"align":"center"} -->\n<figure><img src="x.jpg"/></figure>\n<!-- /wp:image -->';
    assert.equal(stripGutenbergComments(html), '<figure><img src="x.jpg"/></figure>');
  });

  it('handles multiple blocks', () => {
    const html = [
      '<!-- wp:paragraph -->', '<p>One</p>', '<!-- /wp:paragraph -->',
      '', '<!-- wp:paragraph -->', '<p>Two</p>', '<!-- /wp:paragraph -->',
    ].join('\n');
    const result = stripGutenbergComments(html);
    assert.ok(result.includes('<p>One</p>'));
    assert.ok(result.includes('<p>Two</p>'));
    assert.ok(!result.includes('wp:'));
  });

  it('returns empty string for empty input', () => {
    assert.equal(stripGutenbergComments(''), '');
    assert.equal(stripGutenbergComments(null as unknown as string), '');
  });

  it('passes through HTML without Gutenberg comments', () => {
    assert.equal(stripGutenbergComments('<p>Plain HTML</p>'), '<p>Plain HTML</p>');
  });

  it('strips self-named blocks (wp:cover-image, wp:core-embed)', () => {
    const html = '<!-- wp:cover-image {"url":"x.jpg","id":86} -->\n<div>Cover</div>\n<!-- /wp:cover-image -->';
    assert.equal(stripGutenbergComments(html), '<div>Cover</div>');
  });
});
