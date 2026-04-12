# Contentstack → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

Contentstack is a headless CMS with content types, entries, and assets. Its field types and structure are the closest to Contentful among popular CMSs, making migration relatively straightforward.

## 1. Export

Use the [Contentstack CLI](https://www.contentstack.com/docs/developers/cli/) or the [Management API](https://www.contentstack.com/docs/developers/apis/content-management-api/):

```bash
# CLI export
npx @contentstack/cli cs:cm:export --stack-api-key=KEY --management-token=TOKEN --data-dir=export/

# The export produces:
# export/content_types/*.json — schema definitions
# export/entries/<ct>/<locale>/*.json — entry data
# export/assets/ — asset metadata
```

## 2. Schema Mapping

| Contentstack | Contentful |
|-------------|------------|
| Single line | `Symbol` |
| Multi line | `Text` |
| Rich Text / JSON RTE | `RichText` |
| Number | `Number` or `Integer` |
| Boolean | `Boolean` |
| Date | `Date` |
| File | `Link` (Asset) |
| Reference (single) | `Link` (Entry) |
| Reference (multiple) | `Array` of `Link` (Entry) |
| Select | `Symbol` with in-validation |
| Group | `Object` or separate content type |
| Modular Blocks | `Array` of `Link` (Entry) |
| Global field | Reusable content type (linked) |
| URL | `Symbol` |

## 3. Transform

```js
// transforms/contentstack.js
export function register(registry) {
  registry.add('blog_post', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: d.title,
      slug: d.url?.replace(/^\//, '') || d.uid,
      body: d.rich_text_editor || d.json_rte,
      publishDate: d.date || d.created_at,
      author: d.author?.[0]?.uid
        ? helpers.createLink(d.author[0].uid, 'Entry') : undefined,
      heroImage: d.featured_image?.uid
        ? helpers.createLink(d.featured_image.uid, 'Asset') : undefined,
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export/entries/ --transforms=transforms/ --format=dir --open
```

## 5. Edge Cases

- **JSON RTE** — Contentstack's JSON RTE is structurally similar to Contentful Rich Text but not identical; needs node-type mapping
- **Modular Blocks** — Each block becomes a linked Contentful entry; map `_content_type_uid` to the correct CT
- **References** — Contentstack uses UIDs; map to Contentful entry IDs
- **Localization** — Contentstack has "language" variants; map per-entry locale to Contentful locales
- **Workflows** — Contentstack workflow stages don't map to Contentful; decide publish state
- **Global Fields** — Convert to shared content types in Contentful
