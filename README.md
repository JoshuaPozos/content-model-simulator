# content-model-simulator

Preview your Contentful content model locally — **zero API calls, zero dependencies**.

Simulate how your content types, entries, and assets **will look** in Contentful before you commit to an actual migration. This tool runs **entirely offline** — it never connects to Contentful, never uploads data, and never modifies your Contentful space. You get an interactive local preview so you can validate your content model, catch errors early, and iterate with confidence.

Works for both **designing content models from scratch** and **previewing how a migration from another CMS will look**.

> **This is a simulation tool, not a migration tool.** It generates a local preview of your content model and entries. The actual migration to Contentful (via `contentful-migration`, `contentful-import`, or the Management API) is a separate step you perform once you're satisfied with the simulation.

## Features

- **Zero dependencies** — pure Node.js (≥ 18), nothing to install beyond the package
- **Two workflows** — preview content models from scratch (auto-generated mock data) or simulate migrations with real data
- **Interactive Content Browser** — replica of the Contentful UI to browse entries, filter by type/locale, inspect fields, follow references
- **Content Model Graph** — SVG-based interactive diagram showing content types, fields, and relationships with pan/zoom/drag
- **Mock Data Generator** — auto-generates realistic sample entries from your schemas with field-type-aware values
- **Contentful Validation** — catches the same errors Contentful would reject: missing required fields, unknown fields, unresolved links
- **Contentful Schema Format** — uses the exact Contentful content type definition format (Symbol, Text, RichText, Link, Array, etc.)
- **Universal Reader** — reads NDJSON, JSON arrays, or directories of JSON files
- **CMS Migration Guides** — step-by-step stubs for WordPress, Sanity, DatoCMS, Strapi, Contentstack, Prismic, Hygraph, Bloomreach
- **Extensible** — register custom transformers, asset detectors, and nested object extractors

## Quick Start

```bash
npm install content-model-simulator
```

### Workflow 1: Preview a content model (no data needed)

Define your Contentful content types and instantly see how they'll look — the simulator generates realistic mock entries for you.

```bash
# Just point at your schemas directory
npx cms-sim --schemas=schemas/ --open

# With multiple locales
npx cms-sim --schemas=schemas/ --locales=en,es,fr --open

# More sample entries per type
npx cms-sim --schemas=schemas/ --entries-per-type=10 --open
```

### Workflow 2: Preview a migration (with source data)

Feed real data exported from another CMS alongside your Contentful schemas to preview how the migrated content **would look** in Contentful. No data is sent anywhere — the simulation runs 100% locally.

```bash
# From NDJSON export
npx cms-sim --schemas=schemas/ --input=data/export.ndjson --open

# With custom transformers for the source CMS format
npx cms-sim --schemas=schemas/ --input=data/ --transforms=transforms/ --open

# With locale mapping
npx cms-sim --schemas=schemas/ --input=data/ --locale-map=locales.json --verbose --open
```

## CLI Reference

```
cms-sim --schemas=<dir> [options]                  # Preview content model
cms-sim --schemas=<dir> --input=<path> [options]   # Preview migration locally

REQUIRED:
  --schemas=<dir>        Content type definitions directory (.js/.mjs/.json)

DATA SOURCE (optional):
  --input=<path>         Source data (NDJSON, JSON, or directory)
                         If omitted, mock entries are auto-generated from schemas

OPTIONS:
  --transforms=<dir>     Custom transformer modules directory
  --config=<file>        JSON config file (cms-sim.config.json)
  --output=<dir>         Output directory (default: ./output/<name>_<timestamp>)
  --name=<string>        Project name (default: derived from input or schemas dir)
  --base-locale=<code>   Base locale (default: en)
  --locales=<list>       Comma-separated locale codes (default: base locale only)
  --locale-map=<file>    JSON file mapping source → target locale codes
  --entries-per-type=<n> Mock entries per content type (default: 3, only without --input)
  --format=<fmt>         Input format: ndjson, json, dir (default: auto-detect)
  --json                 JSON output only (skip HTML generation)
  --open                 Auto-open HTML report in browser
  --verbose, -v          Verbose logging
  --help, -h             Show help
```

## Programmatic API

### From scratch (mock data)

```js
import {
  simulate,
  generateMockData,
  SchemaRegistry,
  TransformerRegistry,
  generateContentBrowserHTML,
  writeReport,
} from 'content-model-simulator';

// 1. Load schemas
const schemas = new SchemaRegistry();
await schemas.loadFromDirectory('./schemas');

// 2. Generate mock entries
const { documents } = generateMockData(schemas.all(), {
  entriesPerType: 5,
  baseLocale: 'en',
  locales: ['en', 'es'],
});

// 3. Simulate
const report = simulate({
  documents,
  schemas,
  transformers: new TransformerRegistry(),
  options: { name: 'my-model', baseLocale: 'en', locales: ['en', 'es'] },
});

// 4. Output
writeReport(report, './output/my-model');
```

### With real data (migration)

```js
import {
  simulate,
  readDocuments,
  SchemaRegistry,
  TransformerRegistry,
  generateContentBrowserHTML,
  generateModelGraphHTML,
  writeReport,
} from 'content-model-simulator';

// 1. Read source documents
const documents = await readDocuments('./data/export.ndjson');

// 2. Load content type schemas
const schemas = new SchemaRegistry();
await schemas.loadFromDirectory('./schemas');

// 3. Run simulation
const report = simulate({
  documents,
  schemas,
  transformers: new TransformerRegistry(),
  options: {
    name: 'my-project',
    baseLocale: 'en',
  },
});

// 4. Generate outputs
const browserHTML = generateContentBrowserHTML(report);
const graphHTML = generateModelGraphHTML(report);

// Or write everything to disk
writeReport(report, './output/my-project');
```

## Content Type Schema Format

Schemas follow the Contentful content type definition structure:

```js
// schemas/blogPost.js
export default {
  id: 'blogPost',
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'body', name: 'Body', type: 'Text', required: true, localized: true },
    { id: 'author', name: 'Author', type: 'Symbol', localized: false },
    { id: 'publishDate', name: 'Publish Date', type: 'Date', required: true },
    { id: 'heroImage', name: 'Hero Image', type: 'Link', linkType: 'Asset' },
    { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' } },
    { id: 'relatedPosts', name: 'Related Posts', type: 'Array', items: { type: 'Link', linkType: 'Entry' } },
  ],
};
```

Schemas can be `.js` (ESM default export), `.mjs`, or `.json` files.

## Source Document Format

Each source document should be an object with at minimum:

```json
{
  "contentType": "blogPost",
  "locale": "en",
  "path": "/blog/my-post",
  "data": {
    "title": "My Post",
    "body": "<p>Hello world</p>",
    "author": "Jane Doe"
  }
}
```

The `data` object holds the field values. The reader auto-detects NDJSON (one JSON object per line), JSON arrays, or directories of individual `.json` files.

## Custom Transformers

For content types that need special mapping logic:

```js
// transforms/event.js
export function register(registry) {
  registry.register('sourceEventType', (doc, locale, options) => {
    return {
      id: `event-${doc.data.slug}-${locale}`,
      contentType: 'event',
      locale,
      fields: {
        title: { [locale]: doc.data.eventName },
        date: { [locale]: new Date(doc.data.timestamp).toISOString() },
        location: { [locale]: `${doc.data.city}, ${doc.data.country}` },
      },
    };
  }, 'event');
}
```

## Config File

Create `cms-sim.config.json` in your project root:

```json
{
  "name": "my-project",
  "input": "./data/export.ndjson",
  "schemas": "./schemas",
  "transforms": "./transforms",
  "baseLocale": "en",
  "locales": ["en", "es", "fr"],
  "localeMap": {
    "en_US": "en",
    "es_MX": "es",
    "fr_FR": "fr"
  },
  "fieldGroupMap": {
    "heroSlider": {
      "items": "heroSliderItem"
    }
  }
}
```

## Output Structure

```
output/my-project_2024-01-15/
├── content-types/        # Individual CT definition JSON files
│   ├── blogPost.json
│   └── event.json
├── entries/              # Entries grouped by content type
│   ├── blogPost.json
│   └── event.json
├── assets.json           # All extracted assets
├── validation-report.json # Errors and warnings
├── manifest.json         # Summary stats
├── content-browser.html  # Interactive entry browser
└── visual-report.html    # Content model graph
```

## Report Object

The `simulate()` function returns a report with this shape:

```js
{
  page: 'my-project',
  timestamp: '2024-01-15T10:30:00',
  baseLocale: 'en',
  locales: ['en', 'es'],
  contentTypes: { /* CT definitions with entryCount */ },
  entries: [ /* transformed entries */ ],
  assets: [ /* extracted assets */ ],
  pageEntry: null, // or page-level entry if detected
  errors: [ /* { type, contentType, message, entryId } */ ],
  warnings: [ /* { type, contentType, field, entryId } */ ],
  stats: {
    totalCTs: 5,
    totalComponents: 42,
    totalAssets: 12,
    totalLocales: 2,
    totalErrors: 0,
    totalWarnings: 3,
  },
}
```

## CMS Migration Guides

Step-by-step guides for **previewing** migrations from popular CMSs. Each guide covers exporting data from the source CMS, mapping schemas to Contentful field types, writing custom transformers, and running a local simulation to verify everything looks correct before you perform the actual migration.

| Source CMS | Guide |
|------------|-------|
| WordPress | [examples/migration-guides/wordpress/](examples/migration-guides/wordpress/) |
| Sanity | [examples/migration-guides/sanity/](examples/migration-guides/sanity/) |
| DatoCMS | [examples/migration-guides/datocms/](examples/migration-guides/datocms/) |
| Strapi | [examples/migration-guides/strapi/](examples/migration-guides/strapi/) |
| Contentstack | [examples/migration-guides/contentstack/](examples/migration-guides/contentstack/) |
| Prismic | [examples/migration-guides/prismic/](examples/migration-guides/prismic/) |
| Hygraph (GraphCMS) | [examples/migration-guides/hygraph/](examples/migration-guides/hygraph/) |
| Bloomreach | [examples/migration-guides/bloomreach/](examples/migration-guides/bloomreach/) |

## What This Tool Does NOT Do

- **Does NOT connect to Contentful** — no API keys, no network calls, no authentication
- **Does NOT create or modify content types** in your Contentful space
- **Does NOT upload entries or assets** to Contentful
- **Does NOT run `contentful-migration` scripts** — that's a separate step

This is purely a local preview and validation tool. Once your simulation looks correct, you use Contentful's own tools (`contentful-migration`, `contentful-import`, or the Management API) to perform the actual migration.

## License

MIT
