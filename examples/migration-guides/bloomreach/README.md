# Bloomreach → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

Bloomreach (brXM / Experience Manager) stores content as hierarchical documents in a JCR (Java Content Repository). Content types are defined via namespace definitions, and documents have a path-based structure with compound field types and localized variants.

## 1. Export

Bloomreach doesn't have a standard CLI export. Common approaches:

```bash
# REST API (if Delivery API is enabled)
curl "https://your-channel.bloomreach.io/delivery/site/v1/channels/your-channel/documents" > docs.json

# JCR Export (XML)
# Use the CMS Console or Repository Servlet to export JCR nodes

# Custom export script (Groovy/Java)
# Export via the Bloomreach Groovy Console or a custom REST endpoint
```

The original `content-model-simulator` package was built from a Bloomreach migration project. The expected NDJSON format:

```json
{"contentType":"blogPost","locale":"en","path":"/content/documents/blog/my-post","data":{"title":"My Post","body":"<html>...</html>","image":{"type":"hippogallery:handle","path":"/content/gallery/blog/hero.jpg"}}}
```

## 2. Schema Mapping

| Bloomreach | Contentful |
|-----------|------------|
| `String` property | `Symbol` |
| `Text` / `Html` property | `Text` or `RichText` |
| `Long` | `Integer` |
| `Double` | `Number` |
| `Boolean` | `Boolean` |
| `Date` (Calendar) | `Date` |
| `hippogallery:handle` (image link) | `Link` (Asset) |
| `hippo:mirror` (doc link) | `Link` (Entry) |
| Compound type (nested) | `Object` or separate content type |
| Multiple compound | `Array` of `Link` (Entry) |
| Selection (dropdown) | `Symbol` with in-validation |
| `hippostd:html` | `RichText` |

## 3. Transform

```js
// transforms/bloomreach.js
export function register(registry) {
  registry.add('blogPost', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: d.title,
      slug: doc.path?.split('/').pop() || helpers.generateEntryId('blogPost', doc.path),
      body: d.body || d.content,
      publishDate: d.publicationDate || d['hippostdpubwf:publicationDate'],
      heroImage: d.image?.path
        ? helpers.createLink(helpers.simpleHash(d.image.path), 'Asset') : undefined,
      // TODO: Map compound types, link references
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Hippo HTML** — Bloomreach stores rich text as raw HTML with internal links (`<a href="...">`); convert to Contentful Rich Text
- **Compound types** — Nested JCR nodes with their own properties; flatten or create linked entries
- **Image variants** — Bloomreach generates image variants (original, thumbnail); pick the original
- **Mirror links** — `hippo:mirror` references use JCR paths; resolve to stable entry IDs
- **Channels** — Bloomreach multi-channel may have overlapping content; deduplicate by document handle
- **Localization** — Bloomreach uses translation folders or locale variants under the same document handle
- **Document workflow** — Bloomreach has draft/live/offline states; filter to published documents
