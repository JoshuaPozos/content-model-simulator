# Sanity → Contentful Migration Guide

> **Full guide with working example:** See [`examples/sanity/`](../../sanity/)

The full Sanity guide includes:
- Working sample data (NDJSON) covering all common Sanity field types
- Schemas and transforms with detailed inline comments
- Programmatic `run.js` example
- Step-by-step walkthrough from export to import
- Transform patterns for every Sanity field type (slug, localeString, Portable Text, refs, images, nested objects)
- Common mistakes and how to avoid them (with symptoms)
- Warning reference table

---

## Quick Reference

### How the Sanity Reader Normalizes Fields

| Sanity structure | After reader normalization |
|---|---|
| `{ _type: "slug", current: "my-post" }` | `"my-post"` (plain string) |
| Portable Text block arrays | HTML string |
| `{ _type: "localeString", en: "Hi", es: "Hola" }` | `{ en: "Hi", es: "Hola" }` (no `_type`) |
| `{ _ref: "doc-123", _type: "reference" }` | Kept as-is (you map it) |
| `{ _type: "image", asset: { _ref: "..." } }` | Kept as-is (you map it) |
| System fields (`_id`, `_type`, `_rev`, etc.) | Stripped from data |
| `drafts.*` documents | Excluded by default |
| `system.*` types | Excluded by default |
| `sanity.imageAsset` documents | Excluded from docs, collected in `assets` |

### Transform Return Shape

```js
// ✅ CORRECT — every transform must return this shape
export function register(registry) {
  registry.register('post', (doc, locale) => {
    const d = doc.data || {};
    return {
      fields: {
        title: { [locale]: d.title },
        body:  { [locale]: d.body },
      },
    };
  }, 'blogPost');

  registry.skip(['system.group', 'system.retention']);
}
```

### Schema Mapping

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

### Simulate

```bash
npx cms-sim \
  --schemas=schemas/ \
  --input=data/data.ndjson \
  --transforms=transforms/ \
  --locales=en \
  --open
```
