# Example Plugin: SEO Metadata

Demonstrates the three plugin conventions supported by `--plugins=<dir>`.

## Structure

```
example/
├── schemas/
│   └── seoMetadata.js      ← Auto-discovered: adds a new content type
├── transforms/
│   └── seo.js              ← Auto-discovered: exports register(registry)
└── add-seo-link.js          ← Root .js file: exports setup({ schemas, transformers })
```

## What each file does

| File | Convention | Effect |
|------|-----------|--------|
| `schemas/seoMetadata.js` | `schemas/` subdirectory | Registers an `seoMetadata` content type with SEO fields (title, description, canonicalUrl, ogImage, etc.) |
| `transforms/seo.js` | `transforms/` subdirectory — `export function register(registry)` | Maps raw SEO data fields (`meta_title`, `meta_description`, `canonical_url`, etc.) to the `seoMetadata` schema |
| `add-seo-link.js` | Root `.js` file — `export function setup({ schemas, transformers })` | Injects an `seo` Link:Entry field into every content type that doesn't already have one |

## Usage

```bash
# Use with any schemas directory
cms-sim --schemas=my-schemas/ --plugins=plugins/example --output=output/ --verbose

# With real data (seoMetadata entries come from input)
cms-sim --schemas=my-schemas/ --input=data.ndjson --plugins=plugins/example --output=output/
```

> **Note:** In mock mode (no `--input`), mock entries are generated before plugins load,
> so the `seoMetadata` content type will have no entries. The `seo` Link field is still
> injected into all other content types. In real-data workflows, entries for `seoMetadata`
> come from your input data and the transform maps them automatically.
