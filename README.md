# content-model-simulator

Preview your Contentful content model locally — **zero API calls, zero dependencies**.

Simulate how your content types, entries, and assets will look in Contentful without uploading anything. Perfect for prototyping content structures, reviewing migrations, and validating schemas before deploying to Contentful.

## Features

- **Zero dependencies** — pure Node.js (≥ 18), nothing to install beyond the package
- **Interactive Content Browser** — replica of the Contentful UI to browse entries, filter by type/locale, inspect fields, follow references
- **Content Model Graph** — SVG-based interactive diagram showing content types, fields, and relationships with pan/zoom/drag
- **Contentful Validation** — catches the same errors Contentful would reject: missing required fields, unknown fields, unresolved links, and more
- **Contentful Schema Format** — uses the exact Contentful content type definition format (Symbol, Text, RichText, Link, Array, etc.)
- **Universal Reader** — reads NDJSON, JSON arrays, or directories of JSON files
- **Generic Transformer** — 1:1 field mapping that handles 99% of content types out of the box
- **Extensible** — register custom transformers, asset detectors, and nested object extractors

## Quick Start

```bash
# Install
npm install content-model-simulator

# Run via CLI
npx cms-sim --input=data/export.ndjson --schemas=schemas/ --open
```

## CLI Usage

```
cms-sim --input=<path> --schemas=<dir> [options]

REQUIRED:
  --input=<path>        Source data (NDJSON file, JSON file, or directory)
  --schemas=<dir>       Content type definitions directory (.js/.mjs/.json)

OPTIONS:
  --transforms=<dir>    Custom transformer modules directory
  --config=<file>       JSON config file (cms-sim.config.json)
  --output=<dir>        Output directory (default: ./output/<name>_<timestamp>)
  --name=<string>       Project name (default: derived from input filename)
  --base-locale=<code>  Base locale (default: en)
  --locale-map=<file>   JSON file mapping source → target locale codes
  --json                JSON output only (skip HTML generation)
  --open                Auto-open HTML report in browser
  --verbose, -v         Verbose logging
  --help, -h            Show help
```

### Examples

```bash
# Simulate from NDJSON export
cms-sim --input=data/bloomreach-export.ndjson --schemas=schemas/

# With custom output directory and auto-open
cms-sim --input=data/ --schemas=schemas/ --name=homepage --output=out/test --open

# JSON-only output (no HTML)
cms-sim --input=data/export.json --schemas=schemas/ --json

# With config file
cms-sim --config=cms-sim.config.json
```

## Programmatic API

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

## License

MIT
