# WordPress → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

WordPress stores content in a MySQL database with posts, pages, custom post types, taxonomies, and ACF/meta fields. This guide covers exporting WordPress content and simulating the migration to Contentful.

## 1. Export

Use [WP CLI](https://developer.wordpress.org/cli/commands/export/) or the [WordPress REST API](https://developer.wordpress.org/rest-api/) to export content:

```bash
# WP CLI — XML export
wp export --post_type=post,page --output=export.xml

# REST API — JSON (requires scripting)
curl https://yoursite.com/wp-json/wp/v2/posts?per_page=100 > posts.json
```

Convert the export to NDJSON format for `content-model-simulator`:

```bash
# TODO: Provide a conversion script
node scripts/wp-to-ndjson.js export.xml > export.ndjson
```

## 2. Schema Mapping

| WordPress | Contentful |
|-----------|------------|
| `post_title` | `Symbol` |
| `post_content` | `RichText` |
| `post_excerpt` | `Text` |
| `post_date` | `Date` |
| `featured_media` | `Link` (Asset) |
| `categories` / `tags` | `Array` of `Symbol` or `Link` (Entry) |
| ACF text field | `Symbol` or `Text` |
| ACF image field | `Link` (Asset) |
| ACF relationship | `Link` (Entry) or `Array` of `Link` |

## 3. Transform

```js
// transforms/wordpress.js
export function register(registry) {
  registry.add('post', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: d.post_title || d.title?.rendered,
      slug: d.post_name || d.slug,
      body: d.post_content || d.content?.rendered,
      excerpt: d.post_excerpt || d.excerpt?.rendered,
      publishDate: d.post_date || d.date,
      // TODO: Map categories, tags, featured image
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Gutenberg blocks** → Parse block HTML into Contentful Rich Text nodes
- **Shortcodes** → Strip or convert to embedded entries
- **ACF Flexible Content** → Map to Contentful references or inline entries
- **Media library** → Download and re-upload to Contentful Assets
- **Multi-language (WPML/Polylang)** → Map language slugs to Contentful locale codes via `--locale-map`
