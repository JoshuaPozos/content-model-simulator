# DatoCMS → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

DatoCMS provides a GraphQL API and a REST Content Management API. Content is organized by models (equivalent to content types) with fields, and supports localization natively.

## 1. Export

Use the [DatoCMS CMA](https://www.datocms.com/docs/content-management-api) or the [datocms-client](https://github.com/datocms/js-datocms-client):

```bash
# Using the CMA REST API
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  "https://site-api.datocms.com/items?filter[type]=blog_post&page[limit]=100" > posts.json

# Or use dato CLI
npx datocms migrations:export --output=export.json
```

Convert to NDJSON:

```bash
# TODO: Provide conversion script
node scripts/dato-to-ndjson.js export.json > export.ndjson
```

## 2. Schema Mapping

| DatoCMS | Contentful |
|---------|------------|
| Single-line string | `Symbol` |
| Multi-line text | `Text` |
| Structured text | `RichText` |
| Integer | `Integer` |
| Float | `Number` |
| Boolean | `Boolean` |
| Date / DateTime | `Date` |
| File (single) | `Link` (Asset) |
| Gallery (file array) | `Array` of `Link` (Asset) |
| Link (single) | `Link` (Entry) |
| Links (multiple) | `Array` of `Link` (Entry) |
| Slug | `Symbol` |
| Color | `Object` or `Symbol` |
| SEO | `Object` or separate content type |
| Lat/Lon | `Location` |
| JSON | `Object` |
| Modular content | `Array` of `Link` (Entry) |

## 3. Transform

```js
// transforms/datocms.js
export function register(registry) {
  registry.add('blog_post', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: d.title,
      slug: d.slug,
      body: d.structured_text, // TODO: Convert DatoCMS Structured Text → Rich Text
      publishDate: d.first_published_at || d.created_at,
      heroImage: d.cover_image?.upload_id
        ? helpers.createLink(d.cover_image.upload_id, 'Asset') : undefined,
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Structured Text → Rich Text** — DatoCMS uses DAST (DatoCMS AST); needs conversion to Contentful RT
- **Localization** — DatoCMS returns localized fields inline (`{ en: "...", es: "..." }`); flatten per locale
- **Modular content** — Each block becomes a separate Contentful entry with a link
- **Uploads** — Handled via DatoCMS Uploads API; map upload IDs to Contentful Asset IDs
- **Environments** — DatoCMS has environments (sandbox); export from the correct one
