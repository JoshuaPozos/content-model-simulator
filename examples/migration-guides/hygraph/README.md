# Hygraph (GraphCMS) → Contentful Migration Guide

> **Status:** Stub — contributions welcome.

## Overview

Hygraph (formerly GraphCMS) is a GraphQL-native headless CMS. Content is modeled with schemas, components, and enumerations. All data access is via GraphQL, and content supports localization at the field level.

## 1. Export

Use the [Hygraph Management SDK](https://hygraph.com/docs/api-reference/content-api) or GraphQL queries:

```graphql
# Export all blog posts
query {
  blogPosts(first: 1000) {
    id
    title
    slug
    content { html markdown }
    publishedAt
    coverImage { url fileName }
    authors { id name }
    localizations(includeCurrent: true) {
      locale
      title
      content { html }
    }
  }
}
```

Save results to JSON and convert to NDJSON:

```bash
# TODO: Provide conversion script
node scripts/hygraph-to-ndjson.js export.json > export.ndjson
```

## 2. Schema Mapping

| Hygraph | Contentful |
|---------|------------|
| Single line text | `Symbol` |
| Multi line text | `Text` |
| Rich text | `RichText` |
| Int | `Integer` |
| Float | `Number` |
| Boolean | `Boolean` |
| Date / DateTime | `Date` |
| Asset (single) | `Link` (Asset) |
| Asset (multiple) | `Array` of `Link` (Asset) |
| Reference (single) | `Link` (Entry) |
| Reference (multiple) | `Array` of `Link` (Entry) |
| Enumeration | `Symbol` with in-validation |
| JSON | `Object` |
| Color | `Symbol` or `Object` |
| Location | `Location` |
| Slug | `Symbol` |
| Component (single) | `Link` (Entry) or `Object` |
| Component (repeatable) | `Array` of `Link` (Entry) |

## 3. Transform

```js
// transforms/hygraph.js
export function register(registry) {
  registry.add('BlogPost', (doc, schema, helpers) => {
    const d = doc.data || doc.fields || {};
    return {
      title: d.title,
      slug: d.slug,
      body: d.content?.html || d.content?.markdown,
      publishDate: d.publishedAt,
      heroImage: d.coverImage?.id
        ? helpers.createLink(d.coverImage.id, 'Asset') : undefined,
      authors: d.authors?.map(a => helpers.createLink(a.id, 'Entry')),
    };
  });
}
```

## 4. Simulate

```bash
cms-sim --schemas=schemas/ --input=export.ndjson --transforms=transforms/ --open
```

## 5. Edge Cases

- **Rich text** — Hygraph rich text can be retrieved as HTML, markdown, or AST; HTML is easiest to convert
- **Components** — Hygraph components (like Contentful embedded entries) need their own content types
- **Union types** — Hygraph polymorphic references may need `__typename` to determine the target CT
- **Localization** — Hygraph returns `localizations` array; flatten one entry per locale for the simulator
- **Stages** — Hygraph has content stages (DRAFT, PUBLISHED); filter or use `stage` in your export query
- **Scheduled publishing** — Hygraph scheduled ops don't map to Contentful; handle publish dates manually
