# Prismic → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

Prismic uses "Custom Types" with slices (modular components). Content is stored as JSON documents with a unique document structure that includes typed fields and slice zones.

## 1. Export

Use the [Prismic Migration API](https://prismic.io/docs/migration-api-technical-reference) or the [Document API](https://prismic.io/docs/api):

```bash
# Query all documents via the API
curl "https://your-repo.cdn.prismic.io/api/v2/documents/search?pageSize=100" \
  -H "Authorization: Token YOUR_TOKEN" > documents.json

# Or use the bulk export tool
npx @prismicio/migrate export --repository=your-repo --output=export/
```

Convert to NDJSON:

```bash
# TODO: Provide conversion script
node scripts/prismic-to-ndjson.js documents.json > export.ndjson
```

## 2. Schema Mapping

| Prismic | Contentful |
|---------|------------|
| Key Text | `Symbol` |
| Rich Text / Title | `RichText` or `Symbol` |
| Number | `Number` |
| Boolean | `Boolean` |
| Date / Timestamp | `Date` |
| Image | `Link` (Asset) |
| Content Relationship | `Link` (Entry) |
| Link (web/media/doc) | `Symbol` (URL) or `Link` (Entry/Asset) |
| Select | `Symbol` with in-validation |
| Color | `Symbol` |
| GeoPoint | `Location` |
| Embed | `Object` |
| Group (repeatable) | `Array` of `Object` or `Link` (Entry) |
| Slice Zone | `Array` of `Link` (Entry) |

## 3. Transform

```js
// transforms/prismic.js
export function register(registry) {
  registry.add('blog_post', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: Array.isArray(d.title) ? d.title.map(t => t.text).join('') : d.title,
      slug: doc.uid || doc.path,
      body: d.body, // TODO: Convert Prismic Rich Text AST → Contentful Rich Text
      publishDate: d.date || doc.first_publication_date,
      heroImage: d.featured_image?.url
        ? helpers.createLink(d.featured_image.id || 'asset-' + helpers.simpleHash(d.featured_image.url), 'Asset')
        : undefined,
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Rich Text AST** — Prismic stores rich text as an array of blocks with spans; needs conversion to Contentful RT document
- **Slices** — Each slice type becomes a separate Contentful content type; map `slice_type` to CT IDs
- **Image crops/responsive** — Prismic auto-generates responsive views; pick the base image
- **UIDs** — Prismic documents have UIDs (slugs); use as part of entry ID generation
- **Multilingual** — Prismic uses `lang` field (e.g., `en-us`, `es-es`); normalize to Contentful locale codes
- **Repeatable groups** — Convert to arrays of linked entries or inline objects
