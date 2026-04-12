# Strapi → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

Strapi is an open-source headless CMS with a REST or GraphQL API. Content types are defined in code or the admin UI. Content is stored in a database (SQLite, PostgreSQL, MySQL, MariaDB).

## 1. Export

Use the [Strapi REST API](https://docs.strapi.io/dev-docs/api/rest) or direct database export:

```bash
# REST API
curl "http://localhost:1337/api/articles?populate=*&pagination[limit]=100" > articles.json

# Or use strapi export (Strapi v4.6+)
npx strapi export --file=backup
```

Convert to NDJSON:

```bash
# TODO: Provide conversion script
node scripts/strapi-to-ndjson.js articles.json > export.ndjson
```

## 2. Schema Mapping

| Strapi | Contentful |
|--------|------------|
| Short text | `Symbol` |
| Long text / Rich text | `Text` or `RichText` |
| Number (integer) | `Integer` |
| Number (float/decimal) | `Number` |
| Boolean | `Boolean` |
| Date / DateTime | `Date` |
| Media (single) | `Link` (Asset) |
| Media (multiple) | `Array` of `Link` (Asset) |
| Relation (one) | `Link` (Entry) |
| Relation (many) | `Array` of `Link` (Entry) |
| UID | `Symbol` |
| Enumeration | `Symbol` with in-validation |
| JSON | `Object` |
| Component (single) | `Link` (Entry) or `Object` |
| Component (repeatable) | `Array` of `Link` (Entry) |
| Dynamic Zone | `Array` of `Link` (Entry) |

## 3. Transform

```js
// transforms/strapi.js
export function register(registry) {
  registry.add('article', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    const attrs = d.attributes || d;
    return {
      title: attrs.title,
      slug: attrs.slug,
      body: attrs.content, // Strapi rich text is Markdown or HTML
      publishDate: attrs.publishedAt,
      heroImage: attrs.cover?.data?.id
        ? helpers.createLink(String(attrs.cover.data.id), 'Asset') : undefined,
      category: attrs.category?.data?.attributes?.name,
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Strapi v3 vs v4** — API response structure differs significantly (v4 wraps in `data.attributes`)
- **Components** — Strapi components become separate Contentful entries; preserve parent→child links
- **Dynamic Zones** — Each zone block type maps to a different Contentful content type
- **Media** — Strapi media has formats (thumbnail, small, medium, large); choose which to migrate
- **i18n** — Strapi i18n plugin stores locales per entry; map locale codes to Contentful
- **Relations** — Strapi uses numeric IDs; generate stable entry IDs for Contentful
