# Sanity → Contentful Migration Guide

Step-by-step guide to migrate a Sanity project to Contentful using `content-model-simulator`.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Step 1: Export your Sanity data](#step-1-export-your-sanity-data)
4. [Step 2: Set up the migration project](#step-2-set-up-the-migration-project)
5. [Step 3: Inspect your data](#step-3-inspect-your-data)
6. [Step 4: Define Contentful schemas](#step-4-define-contentful-schemas)
7. [Step 5: Write transforms](#step-5-write-transforms)
8. [Step 6: Run the simulation](#step-6-run-the-simulation)
9. [Step 7: Review and iterate](#step-7-review-and-iterate)
10. [How the Sanity Reader Works](#how-the-sanity-reader-works)
11. [Transform Patterns by Field Type](#transform-patterns-by-field-type)
12. [Common Mistakes](#common-mistakes)
13. [Understanding Warnings](#understanding-warnings)
14. [FAQ](#faq)

---

## Overview

The simulator reads your Sanity NDJSON export, applies your content model (schemas) and field mappings (transforms), auto-converts HTML to Contentful Rich Text, and generates an interactive **Content Browser** that looks like the Contentful dashboard.

You iterate locally until everything looks right, then import into Contentful.

**What the reader does automatically:**

| Sanity structure | After reader normalization |
|---|---|
| `{ _type: "slug", current: "my-post" }` | `"my-post"` (plain string) |
| Portable Text block arrays | HTML string |
| `{ _type: "localeString", en: "Hi", es: "Hola" }` | `{ en: "Hi", es: "Hola" }` (no `_type`) |
| `{ _ref: "doc-123", _type: "reference" }` | Kept as-is (you map it) |
| `{ _type: "image", asset: { _ref: "..." } }` | Kept as-is (you map it) |
| `_id`, `_type`, `_rev`, `_createdAt`, etc. | Stripped from data |
| `_key` fields | Stripped |
| `drafts.*` documents | Excluded (opt-in) |
| `system.*` types | Excluded (opt-in) |
| `sanity.imageAsset` documents | Excluded from docs, collected in `assets` |

---

## Quick Start

```bash
# Run the working example with sample data
cd examples/sanity

# Via CLI
npx cms-sim \
  --schemas=schemas/ \
  --input=data/sample-export.ndjson \
  --transforms=transforms/ \
  --locales=en,es \
  --open

# Or programmatically
node run.js
```

Expected output: 8 entries (3 blog posts, 2 authors, 2 categories, 1 tag — draft excluded), 0 errors.

---

## Step 1: Export your Sanity data

```bash
# Install Sanity CLI if needed
npm install -g @sanity/cli

# Export full dataset (creates .tar.gz with data.ndjson)
sanity dataset export production backup.tar.gz

# Extract the NDJSON
tar -xzf backup.tar.gz
# → data.ndjson (this is your input file)
```

The export is NDJSON (one JSON document per line) — exactly what `content-model-simulator` reads.

---

## Step 2: Set up the migration project

```bash
mkdir my-sanity-migration && cd my-sanity-migration
npm init -y
npm pkg set type=module
npm install content-model-simulator

# Copy your export
mkdir data
cp /path/to/data.ndjson data/

# Create directories
mkdir schemas transforms
```

Your project structure:

```
my-sanity-migration/
├── package.json          ← must have "type": "module"
├── data/
│   └── data.ndjson       ← Sanity export
├── schemas/              ← Contentful content type definitions
└── transforms/           ← Field mapping functions
```

---

## Step 3: Inspect your data

Before writing schemas and transforms, understand what's in your export.

```bash
# Count documents by type
cat data/data.ndjson | \
  node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').split('\n');
    const counts = {};
    for (const l of lines) {
      if (!l.trim()) continue;
      try { const d = JSON.parse(l); counts[d._type] = (counts[d._type]||0) + 1; } catch {}
    }
    console.table(counts);
  "
```

Or use the reader programmatically:

```js
import { readSanity } from 'content-model-simulator';

const docs = readSanity('data/data.ndjson');
const types = {};
for (const d of docs) types[d.contentType] = (types[d.contentType] || 0) + 1;
console.table(types);

// Inspect first document of each type
const seen = new Set();
for (const d of docs) {
  if (seen.has(d.contentType)) continue;
  seen.add(d.contentType);
  console.log(`\n── ${d.contentType} ──`);
  console.log('Fields:', Object.keys(d.data));
  console.log('Sample:', JSON.stringify(d.data, null, 2).slice(0, 500));
}
```

**Important:** Look at the **normalized** data (after `readSanity`), not the raw NDJSON. The reader will have already converted slugs to strings and Portable Text to HTML.

---

## Step 4: Define Contentful schemas

Create one `.js` file per content type in `schemas/`:

```js
// schemas/blogPost.js
/** @type {import('content-model-simulator').ContentTypeDefinition} */
export default {
  id: 'blogPost',           // Contentful content type ID
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'slug',  name: 'Slug',  type: 'Symbol', required: true },
    { id: 'body',  name: 'Body',  type: 'RichText', localized: true },
    // ...
  ],
};
```

### Sanity → Contentful type mapping

| Sanity field type | Contentful `type` | Notes |
|---|---|---|
| `string` | `Symbol` | Max 256 chars |
| `text` | `Text` | Long text (no size limit) |
| `slug` | `Symbol` | Reader already extracts the string |
| `blockContent` / Portable Text | `RichText` | Reader converts to HTML; simulator converts HTML → Rich Text |
| `number` | `Number` or `Integer` | |
| `boolean` | `Boolean` | |
| `datetime` / `date` | `Date` | |
| `image` | `Link` with `linkType: 'Asset'` | |
| `reference` | `Link` with `linkType: 'Entry'` | Add `validations: [{ linkContentType: ['targetType'] }]` |
| `array` of references | `Array` with `items: { type: 'Link', linkType: 'Entry' }` | |
| `array` of strings | `Array` with `items: { type: 'Symbol' }` | |
| `object` | `Object` | For nested data you don't want to flatten |
| `geopoint` | `Location` | |
| `localeString` | Same as base type, add `localized: true` | |

---

## Step 5: Write transforms

This is the most important file. Transforms map Sanity fields to your Contentful schema.

### The Rules

```js
// transforms/sanity.js

// ✅ CORRECT: Export a register() function
export function register(registry) {
  registry.register('post', (doc, locale) => {
    const d = doc.data || {};
    return {
      fields: {                          // ← must be wrapped in { fields: ... }
        title: { [locale]: d.title },    // ← each field wrapped in { [locale]: value }
      },
    };
  }, 'blogPost');  // ← 3rd arg: target Contentful content type ID
}

// ❌ WRONG: Default export
// export default registry;

// ❌ WRONG: Flat return (no fields wrapper, no locale wrapper)
// return { title: d.title };
```

### Full annotated example

See [transforms/sanity.js](./transforms/sanity.js) for a complete working transform with inline comments explaining every pattern.

Key points:
- `doc.data` contains all fields **after reader normalization**
- `locale` is the current locale string (e.g. `"en"`)
- You must return `{ fields: { fieldName: { [locale]: value } } }`
- Use `registry.register(sourceType, transformFn, targetType)` — the 3rd argument maps Sanity `_type` to Contentful content type `id`
- Use `registry.skip([...])` for types that shouldn't become entries

---

## Step 6: Run the simulation

### CLI

```bash
npx cms-sim \
  --schemas=schemas/ \
  --input=data/data.ndjson \
  --transforms=transforms/ \
  --locales=en \
  --output=output/ \
  --open
```

Add `--locales=en,es` if your data has multiple locales (e.g. via `localeString`).

### Programmatic

```bash
node run.js
```

Both produce:

```
output/
├── content-browser.html   ← Open this! Interactive Contentful-like preview
├── visual-report.html     ← Content model graph (SVG)
├── validation-report.json ← Machine-readable errors/warnings
├── manifest.json          ← Summary
├── content-types/         ← Contentful content type JSON files
├── entries/               ← Contentful entry JSON files
└── assets.json            ← Asset references
```

---

## Step 7: Review and iterate

1. **Open `content-browser.html`** in your browser — it looks like the Contentful dashboard
2. Check that all entries appear with the right content types
3. Check that Rich Text fields render correctly (from Portable Text → HTML → Rich Text)
4. Check that Links point to the right entries/assets
5. Review `validation-report.json` for warnings

If something is wrong, edit your schemas and transforms and re-run. The cycle is fast — no API calls needed.

---

## How the Sanity Reader Works

Understanding what the reader does **before** your transform runs is essential. Here are the normalizations:

### Slugs → strings

```
Sanity: { slug: { _type: "slug", current: "my-post" } }
After:  { slug: "my-post" }
```

In your transform: `d.slug` is already a string. No need to access `.current`.

### Portable Text → HTML

```
Sanity: { body: [{ _type: "block", style: "normal", children: [{ _type: "span", text: "Hello" }] }] }
After:  { body: "<p>Hello</p>" }
```

In your transform: `d.body` is an HTML string. If you map it to a `RichText` field, the simulator automatically converts the HTML to Contentful Rich Text.

> **Gotcha:** The field name is preserved from the source. If Sanity calls it `body`, you get `d.body`. If Sanity calls it `content` and it's a direct Portable Text array, you still get `d.content` (as HTML). But if `content` is a wrapper object (like `{ _type: "content", content: [...blocks...] }`), the nested PT arrays inside it are converted to HTML while the wrapper structure is preserved. See [Nested Portable Text](#nested-portable-text-in-custom-wrappers).

### localeString → plain object

```
Sanity: { title: { _type: "localeString", en: "Hello", es: "Hola" } }
After:  { title: { en: "Hello", es: "Hola" } }
```

In your transform: use the `localized()` helper to detect this and return it correctly:

```js
title: localized(d.title, locale),
// If d.title is {en: "Hello", es: "Hola"} → returns as-is (both locales preserved)
// If d.title is "Hello"                   → returns {en: "Hello"}
```

### References → kept as-is

```
Sanity: { author: { _ref: "author-001", _type: "reference" } }
After:  { author: { _ref: "author-001", _type: "reference" } }
```

In your transform: use the `entryLink()` / `assetLink()` helpers:

```js
author: { [locale]: entryLink(d.author) },
// → { en: { sys: { type: "Link", linkType: "Entry", id: "author-001" } } }
```

---

## Transform Patterns by Field Type

### Simple string / number / boolean / date

```js
title: { [locale]: d.title },
price: { [locale]: d.price || null },
featured: { [locale]: d.featured || false },
publishDate: { [locale]: d.publishedAt || null },
```

### Localized string (localeString)

```js
// Use the localized() helper to handle both cases
title: localized(d.title, locale),
```

### Slug (already normalized to string)

```js
slug: { [locale]: d.slug },
```

### Portable Text (already normalized to HTML)

```js
// Map to a RichText field — simulator auto-converts HTML → Contentful Rich Text
body: { [locale]: d.body },

// Or for localized PT:
body: localized(d.body, locale),
```

### Image reference → Asset Link

```js
function assetLink(imageObj) {
  if (!imageObj) return null;
  const ref = imageObj?.asset?._ref || imageObj?._ref;
  if (!ref) return null;
  return { sys: { type: 'Link', linkType: 'Asset', id: ref } };
}

// Usage:
mainImage: { [locale]: assetLink(d.mainImage) },
```

### Document reference → Entry Link

```js
function entryLink(ref) {
  if (!ref) return null;
  const id = ref._ref || ref;
  if (!id || typeof id !== 'string') return null;
  return { sys: { type: 'Link', linkType: 'Entry', id } };
}

// Usage:
author: { [locale]: entryLink(d.author) },
```

### Array of references → Array of Entry Links

```js
categories: {
  [locale]: Array.isArray(d.categories)
    ? d.categories.map(c => entryLink(c)).filter(Boolean)
    : []
},
```

### Nested object (SEO meta, etc.)

```js
// Option A: Flatten into separate fields
seoTitle: { [locale]: d.seoMeta?.metaTitle },
seoDescription: { [locale]: d.seoMeta?.metaDescription },

// Option B: Keep as Object field
seoMeta: { [locale]: d.seoMeta || null },
```

### Nested Portable Text in custom wrappers

Some Sanity schemas nest Portable Text inside custom object types:

```json
{
  "content": {
    "_type": "content",
    "content": [
      { "_type": "blockContentv2", "blockContent": [/* PT blocks */] }
    ]
  }
}
```

The reader converts the **inner** PT blocks to HTML, but preserves the wrapper structure:

```json
{
  "content": {
    "_type": "content",
    "content": [
      { "_type": "blockContentv2", "blockContent": "<p>Hello</p>" }
    ]
  }
}
```

In your transform, extract the HTML:

```js
let body = d.body || null; // Check for direct PT (most common)
if (!body && d.content) {
  // Extract from nested wrapper
  const sections = d.content?.content || [];
  if (Array.isArray(sections)) {
    const htmlParts = sections
      .map(s => s.blockContent)
      .filter(h => typeof h === 'string');
    if (htmlParts.length > 0) body = htmlParts.join('\n');
  }
}
```

### Array of nested objects with Portable Text (flexible content)

```js
// Flatten richTextBlock sections into a single RT field
let allContent = null;
if (Array.isArray(d.flexibleContent)) {
  const htmlParts = d.flexibleContent
    .map(section => section.content)
    .filter(h => typeof h === 'string');
  if (htmlParts.length > 0) allContent = htmlParts.join('\n');
}
flexibleContent: { [locale]: allContent },
```

---

## Common Mistakes

### 1. Flat return instead of `{ fields: { [locale]: ... } }`

```js
// ❌ WRONG — all fields leak through to the generic transformer
return {
  title: d.title,
  slug: d.slug,
};

// ✅ CORRECT
return {
  fields: {
    title: { [locale]: d.title },
    slug:  { [locale]: d.slug },
  },
};
```

**Symptom:** Thousands of `FIELD_NOT_IN_DEFINITION` warnings. All raw Sanity fields (including internal ones like `_type`, `_createdAt`) appear in entries.

### 2. `export default` instead of `export function register()`

```js
// ❌ WRONG — CLI can't find the transform
const registry = new TransformerRegistry();
registry.register('post', ...);
export default registry;

// ✅ CORRECT — CLI and programmatic API both call register()
export function register(registry) {
  registry.register('post', ...);
}
```

**Symptom:** Simulation runs but no transforms are applied. All fields come through raw.

### 3. Accessing `.current` on slugs

```js
// ❌ WRONG — reader already normalized the slug
slug: { [locale]: d.slug?.current },  // → undefined!

// ✅ CORRECT — d.slug is already a string
slug: { [locale]: d.slug },
```

### 4. Expecting raw Portable Text blocks

```js
// ❌ WRONG — reader already converted to HTML
body: { [locale]: convertPortableText(d.body) },  // d.body is already HTML!

// ✅ CORRECT — just pass the HTML, simulator handles HTML → Rich Text conversion
body: { [locale]: d.body },
```

### 5. Not skipping system types

```js
// ❌ WRONG — system.group, system.retention become entries with no matching schema
// (nothing)

// ✅ CORRECT
registry.skip(['system.group', 'system.schema', 'system.retention']);
```

**Symptom:** `NO_TRANSFORM` or `UNKNOWN_CONTENT_TYPE` warnings for system documents.

### 6. Slug path collisions

If multiple Sanity documents share the same slug (e.g., an active museum and its "closed for renovation" copy), they'll merge into one entry. This is a data quality issue in the source — review your data for duplicate slugs.

---

## Understanding Warnings

| Warning | Meaning | Fix |
|---|---|---|
| `HTML_TO_RICHTEXT_CONVERTED` | HTML was auto-converted to Contentful Rich Text | Expected! Means PT → HTML → RT pipeline worked |
| `NULL_FIELD` | A field in your schema has no value | Either the source data is empty, or your transform didn't map it |
| `FIELD_NOT_IN_DEFINITION` | A field in the entry isn't in the schema | Either add the field to your schema, or don't map it in your transform |
| `NO_TRANSFORM` | A document type has no registered transform | Add a transform with `registry.register()` or skip with `registry.skip()` |
| `UNKNOWN_CONTENT_TYPE` | Target content type not found in schemas | Check that the 3rd argument to `registry.register()` matches a schema `id` |

---

## FAQ

### How do I handle Sanity's `@sanity/document-internationalization` plugin?

If your documents have `__i18n_lang` fields, map them to separate locales:

```bash
npx cms-sim ... --locales=en,es,fr
```

In your transform, check `doc.data.__i18n_lang` to determine which locale the document belongs to.

### Can I include draft documents?

Yes — use the `includeDrafts` option:

```js
const docs = readSanity('data.ndjson', { includeDrafts: true });
```

Draft IDs have a `drafts.` prefix that gets stripped automatically.

### How do I handle Sanity image hotspot/crop?

Contentful doesn't have native hotspot support. Options:
- Store hotspot data in a separate `Object` field for custom renderers
- Ignore it (most common)

### How do arrays of complex objects (not references) map?

If you have an array of inline objects (like FAQ items), you have two options:
1. Map to `Object` field (keeps the structure as JSON)
2. Create a separate content type and use `Array` of `Link` (Entry)

### What about Sanity's `block` type with custom marks/decorators?

The reader supports: bold, italic, underline, strikethrough, code, and links. Custom marks are passed through as-is (the text content is preserved, but custom formatting is lost).

### My export has thousands of `sanity.imageAsset` documents. Are they included?

No. Image assets are automatically excluded from the document list but available separately via `parseSanity()`:

```js
import { parseSanity } from 'content-model-simulator';
const { documents, assets } = parseSanity('data.ndjson');
console.log(`${documents.length} documents, ${assets.length} image assets`);
```
