# Sanity → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

Sanity stores content as JSON documents with a flexible schema system. Documents have `_type`, `_id`, and use references (`_ref`) for relationships. Portable Text is Sanity's rich text format.

## 1. Export

Use the [Sanity CLI](https://www.sanity.io/docs/cli) or GROQ queries:

```bash
# Full dataset export (NDJSON)
sanity dataset export production export.tar.gz
tar -xzf export.tar.gz  # produces data.ndjson

# GROQ — specific types
sanity documents query '*[_type == "post"]' --dataset production > posts.json
```

Sanity's NDJSON export is close to what `content-model-simulator` expects. You may only need a light transform.

## 2. Schema Mapping

| Sanity | Contentful |
|--------|------------|
| `string` | `Symbol` |
| `text` | `Text` |
| `blockContent` (Portable Text) | `RichText` |
| `number` | `Number` or `Integer` |
| `boolean` | `Boolean` |
| `datetime` / `date` | `Date` |
| `image` | `Link` (Asset) |
| `reference` | `Link` (Entry) |
| `array` of references | `Array` of `Link` |
| `array` of strings | `Array` of `Symbol` |
| `slug` → `slug.current` | `Symbol` |
| `geopoint` | `Location` |
| `object` | `Object` or separate content type |

## 3. Transform

```js
// transforms/sanity.js
export function register(registry) {
  registry.add('post', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: d.title,
      slug: d.slug?.current || d.slug,
      body: d.body, // TODO: Convert Portable Text → Contentful Rich Text
      publishedAt: d.publishedAt || d._createdAt,
      author: d.author?._ref ? helpers.createLink(d.author._ref, 'Entry') : undefined,
      // TODO: Map image assets, categories
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=data.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Portable Text → Rich Text** — Requires a dedicated converter (block → node mapping)
- **Image hotspot/crop** — Contentful doesn't have native hotspot; store as metadata
- **References (_ref)** — Map Sanity `_id` to Contentful entry IDs
- **Drafts** — Sanity prefixes draft IDs with `drafts.`; filter or handle separately
- **i18n** — If using `@sanity/document-internationalization`, map `__i18n_lang` to Contentful locales
