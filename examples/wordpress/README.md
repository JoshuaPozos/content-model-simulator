# WordPress → Contentful Migration Guide

Step-by-step guide to migrate a WordPress site to Contentful using `content-model-simulator`.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Export your WordPress content](#step-1-export-your-wordpress-content)
4. [Step 2: Set up the migration project](#step-2-set-up-the-migration-project)
5. [Step 3: Auto-scaffold schemas and transforms (optional)](#step-3-auto-scaffold-schemas-and-transforms-optional)
6. [Step 4: Define your Contentful content model](#step-4-define-your-contentful-content-model)
7. [Step 5: Create field mapping transforms](#step-5-create-field-mapping-transforms)
8. [Step 6: Run the simulation](#step-6-run-the-simulation)
9. [Step 7: Review the output](#step-7-review-the-output)
10. [Step 8: Iterate and refine](#step-8-iterate-and-refine)
11. [Step 9: Set up Contentful](#step-9-set-up-contentful)
12. [Step 10: Import into Contentful](#step-10-import-into-contentful)
13. [Understanding warnings](#understanding-warnings)
14. [Data format reference](#data-format-reference)
15. [FAQ](#faq)

---

## Overview

This workflow lets you **preview exactly how your WordPress content will look in Contentful** before touching the Contentful API. The simulator:

1. Reads your WordPress data (XML export or NDJSON)
2. Applies your content model (schemas) and field mappings (transforms)
3. Auto-converts HTML to Contentful Rich Text
4. Generates an interactive **Content Browser** (looks like the Contentful dashboard)
5. Generates a **Content Model Graph** (visual SVG of your content types and relationships)
6. Reports validation errors and warnings

You iterate locally until everything looks right, then import into Contentful.

---

## Prerequisites

- **Node.js 18+** — [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **A WordPress XML export** (WXR format) — see [Step 1](#step-1-export-your-wordpress-content)
- **A Contentful account** (free tier works) — only needed for [Step 9](#step-9-set-up-contentful)

```bash
# Verify Node.js version
node --version   # Must be >= 18.0.0
```

---

## Step 1: Export your WordPress content

### Option A: WordPress XML Export (WXR) — Recommended

1. Log in to your WordPress admin panel
2. Go to **Tools → Export**
3. Select **All content** (or specific post types)
4. Click **Download Export File**

This gives you a `.xml` file in WXR (WordPress eXtended RSS) format. The simulator reads it directly.

### Option B: REST API / WP-CLI export

If you have programmatic access, you can export to NDJSON (one JSON object per line):

```bash
# Example using WP-CLI
wp post list --post_type=post --format=json | \
  jq -c '.[] | {contentType: "blogPost", id: .ID, locale: "en", path: .post_name, data: .}' \
  > wp-export.ndjson
```

Each line must have: `contentType`, `id`, `locale`, `path`, and `data` (the raw fields).

---

## Step 2: Set up the migration project

```bash
# Create project directory
mkdir my-wp-migration && cd my-wp-migration

# Initialize package.json
npm init -y

# Add ESM support (required)
npm pkg set type=module

# Install the simulator
npm install content-model-simulator

# Copy your WordPress export
mkdir data
cp ~/Downloads/your-site.xml data/
```

Your project structure:

```
my-wp-migration/
├── package.json
└── data/
    └── your-site.xml
```

---

## Step 3: Auto-scaffold schemas and transforms (optional)

If you have a WXR (XML) export, the `scaffold` command auto-generates everything:

```bash
npx cms-sim scaffold --input=data/your-site.xml --output=. --verbose
```

This creates:

```
my-wp-migration/
├── schemas/
│   ├── blogPost.js       # One file per WordPress post type
│   ├── page.js
│   ├── author.js
│   ├── category.js
│   └── tag.js
├── transforms/
│   └── wordpress.js      # Field mappings (WP → Contentful)
└── README.md             # Customization guide
```

**Review the generated files** — they're a starting point. You'll likely want to:
- Rename fields to match your Contentful naming conventions
- Remove fields you don't need
- Add validations (e.g., `required`, `in: [...]`)
- Adjust link types and references

> **Tip:** If you prefer to write schemas manually (or you're using NDJSON), skip to [Step 4](#step-4-define-your-contentful-content-model).

---

## Step 4: Define your Contentful content model

Each file in `schemas/` defines one Contentful content type. The format mirrors Contentful's content type definition.

### Example: `schemas/blogPost.js`

```js
/** @type {import('content-model-simulator').ContentTypeDefinition} */
export default {
  id: 'blogPost',
  name: 'Blog Post',
  description: 'Migrated from WordPress posts',
  displayField: 'title',
  fields: [
    { id: 'title', type: 'Symbol', required: true, localized: true },
    { id: 'slug', type: 'Symbol', required: true },
    { id: 'content', type: 'RichText', localized: true },
    { id: 'excerpt', type: 'Text', localized: true },
    { id: 'featuredImage', type: 'Link', linkType: 'Asset' },
    { id: 'author', type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['author'] }] },
    { id: 'category', type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['category'] }] },
    { id: 'tags', type: 'Array', items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['tag'] }] } },
    { id: 'publishDate', type: 'Date', required: true },
    { id: 'status', type: 'Symbol', validations: [{ in: ['draft', 'published', 'archived'] }] },
    { id: 'seoTitle', type: 'Symbol', localized: true },
    { id: 'seoDescription', type: 'Text', localized: true },
  ],
};
```

### Example: `schemas/author.js`

```js
export default {
  id: 'author',
  name: 'Author',
  description: 'Migrated from WordPress users',
  fields: [
    { id: 'name', type: 'Symbol', required: true },
    { id: 'slug', type: 'Symbol', required: true },
    { id: 'bio', type: 'Text' },
    { id: 'avatar', type: 'Link', linkType: 'Asset' },
    { id: 'email', type: 'Symbol' },
    { id: 'website', type: 'Symbol' },
  ],
};
```

### Example: `schemas/category.js`

```js
export default {
  id: 'category',
  name: 'Category',
  description: 'Migrated from WordPress categories',
  fields: [
    { id: 'name', type: 'Symbol', required: true, localized: true },
    { id: 'slug', type: 'Symbol', required: true },
    { id: 'description', type: 'Text', localized: true },
    { id: 'parent', type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['category'] }] },
  ],
};
```

### Supported field types

| Type | Description | WordPress equivalent |
|------|------------|---------------------|
| `Symbol` | Short text (≤256 chars) | `post_title`, `post_name`, short meta |
| `Text` | Long text (markdown/plain) | `post_excerpt`, descriptions |
| `RichText` | Contentful Rich Text JSON | `post_content` (HTML auto-converted) |
| `Integer` | Integer number | `menu_order`, counts |
| `Number` | Decimal number | Prices, ratings |
| `Boolean` | true/false | Checkbox meta fields |
| `Date` | ISO 8601 date | `post_date`, publish dates |
| `Location` | Lat/lng coordinates | Geo meta fields |
| `Object` | Freeform JSON | Complex meta, ACF groups |
| `Link` | Reference to Entry or Asset | Featured image, author, categories |
| `Array` | Array of Symbols or Links | Tags, galleries, multi-select |

---

## Step 5: Create field mapping transforms

Transforms map WordPress field names to your Contentful schema. Without transforms, the simulator uses fields as-is — which produces many `FIELD_NOT_IN_DEFINITION` warnings because WordPress field names don't match Contentful conventions.

### `transforms/wordpress.js`

```js
/**
 * WordPress → Contentful field mapping transformers.
 * @param {import('content-model-simulator').TransformerRegistry} registry
 */
export function register(registry) {
  // Blog Post: wp_post → blogPost
  registry.register('blogPost', (doc, locale) => {
    const d = doc.data || doc.fields || {};
    return {
      fields: {
        title:          { [locale]: d.title },
        slug:           { [locale]: d.slug },
        content:        { [locale]: d.content },         // HTML → auto-converted to Rich Text
        excerpt:        { [locale]: d.excerpt || null },
        featuredImage:  { [locale]: d.featured_image || null },
        author:         { [locale]: d.author_id
          ? { sys: { type: 'Link', linkType: 'Entry', id: `wp-user-${d.author_id}` } }
          : null },
        category:       { [locale]: d.category_id
          ? { sys: { type: 'Link', linkType: 'Entry', id: `wp-cat-${d.category_id}` } }
          : null },
        tags:           { [locale]: (d.tag_ids || []).map(id => ({
          sys: { type: 'Link', linkType: 'Entry', id: `wp-tag-${id}` }
        })) },
        publishDate:    { [locale]: d.date },
        status:         { [locale]: d.status === 'publish' ? 'published' : d.status },
        seoTitle:       { [locale]: d.yoast_title || null },
        seoDescription: { [locale]: d.yoast_description || null },
      },
    };
  });

  // Page: wp_page → page
  registry.register('page', (doc, locale) => {
    const d = doc.data || doc.fields || {};
    return {
      fields: {
        title:         { [locale]: d.title },
        slug:          { [locale]: d.slug },
        content:       { [locale]: d.content },
        featuredImage: { [locale]: d.featured_image || null },
        parent:        { [locale]: d.parent_id && d.parent_id !== 0
          ? { sys: { type: 'Link', linkType: 'Entry', id: d.parent_id } }
          : null },
        template:      { [locale]: d.template || null },
        menuOrder:     { [locale]: d.menu_order || 0 },
      },
    };
  });

  // Author: wp_author → author
  registry.register('author', (doc, locale) => {
    const d = doc.data || doc.fields || {};
    return {
      fields: {
        name:    { [locale]: d.name },
        slug:    { [locale]: d.slug },
        bio:     { [locale]: d.description || null },
        avatar:  { [locale]: d.avatar_url
          ? { sys: { type: 'Link', linkType: 'Asset', id: `avatar-${doc.id}` } }
          : null },
        email:   { [locale]: d.email || null },
        website: { [locale]: d.url || null },
      },
    };
  });

  // Category
  registry.register('category', (doc, locale) => {
    const d = doc.data || doc.fields || {};
    return {
      fields: {
        name:        { [locale]: d.name },
        slug:        { [locale]: d.slug },
        description: { [locale]: d.description || null },
        parent:      { [locale]: d.parent_id
          ? { sys: { type: 'Link', linkType: 'Entry', id: d.parent_id } }
          : null },
      },
    };
  });

  // Tag
  registry.register('tag', (doc, locale) => {
    const d = doc.data || doc.fields || {};
    return {
      fields: {
        name: { [locale]: d.name },
        slug: { [locale]: d.slug },
      },
    };
  });
}
```

### Key concepts

- **`registry.register(contentTypeId, transformFn)`** — registers a transform for a specific content type
- **`doc.data`** — the raw WordPress fields as-is from the export
- **`locale`** — the locale string (e.g., `'en'`). Fields must be wrapped in `{ [locale]: value }`
- **Links** — references to other entries use `{ sys: { type: 'Link', linkType: 'Entry', id: '...' } }`
- **Asset links** — `{ sys: { type: 'Link', linkType: 'Asset', id: '...' } }`
- **HTML → Rich Text** — pass HTML strings as-is; the simulator auto-converts them to Contentful Rich Text JSON when the field type is `RichText`

---

## Step 6: Run the simulation

### With WXR (XML) input

```bash
# Basic run — XML is auto-detected
npx cms-sim --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/ --output=output/ --name='My WP Migration'

# Open the Content Browser in your browser automatically
npx cms-sim --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/ --output=output/ --name='My WP Migration' --open

# Watch mode — re-runs when you edit schemas or transforms
npx cms-sim --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/ --output=output/ --name='My WP Migration' --watch

# Verbose mode — shows detailed pipeline info
npx cms-sim --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/ --output=output/ --name='My WP Migration' --verbose
```

### With NDJSON input

```bash
npx cms-sim --schemas=schemas/ --input=data/wp-export.ndjson --transforms=transforms/ --output=output/ --name='My WP Migration'
```

### Without transforms (raw data inspection)

Useful to see what fields WordPress exports before writing transforms:

```bash
npx cms-sim --schemas=schemas/ --input=data/your-site.xml --output=output/ --name='WP Raw' --verbose
```

This will produce many `FIELD_NOT_IN_DEFINITION` warnings — that's expected. It shows you exactly which fields exist and need mapping.

### Validate only (no HTML output)

```bash
# Human-readable
npx cms-sim validate --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/

# Machine-readable (CI/CD)
npx cms-sim validate --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/ --json
```

---

## Step 7: Review the output

After running the simulation, the `output/` directory contains:

```
output/
├── content-types/
│   ├── blogPost.json          # Content type definition (Contentful format)
│   ├── page.json
│   ├── author.json
│   ├── category.json
│   └── tag.json
├── entries/
│   ├── blogPost/              # Entries grouped by content type
│   │   ├── entry-1.json
│   │   └── ...
│   ├── page/
│   ├── author/
│   ├── category/
│   └── tag/
├── assets.json                # Asset references (images, files)
├── manifest.json              # Summary: counts, locales, timestamps
├── validation-report.json     # All errors and warnings
├── content-browser.html       # ← Open this in your browser
└── visual-report.html         # ← Content model graph
```

### Content Browser (`content-browser.html`)

An interactive entry viewer that looks like the Contentful web app:
- **Left sidebar**: all entries grouped by content type, with search
- **Right panel**: entry detail with all fields, locale switcher, linked entries
- Rich Text fields rendered as formatted HTML
- Click linked entries to navigate between them

### Content Model Graph (`visual-report.html`)

An interactive SVG visualization:
- Each content type as a box with all fields
- Lines showing relationships (Link fields → target content types)
- Click a content type to see details (fields, linked entries, relationships)

### Validation Report (`validation-report.json`)

Check this for issues:

```bash
# Quick summary
cat output/validation-report.json | jq '.errors | length, .warnings | length'

# See all warnings grouped by type
cat output/validation-report.json | jq '.warnings | group_by(.type) | map({type: .[0].type, count: length})'
```

---

## Step 8: Iterate and refine

The typical workflow is:

1. **Run simulation** → review Content Browser → find issues
2. **Adjust schemas** → add missing fields, fix types, add validations
3. **Adjust transforms** → fix field mappings, handle edge cases
4. **Re-run simulation** → verify fixes

### Using watch mode

```bash
npx cms-sim --schemas=schemas/ --input=data/your-site.xml --transforms=transforms/ --output=output/ --name='My WP Migration' --watch --open
```

This opens the Content Browser and automatically re-runs the simulation every time you save a schema or transform file. The browser auto-refreshes.

### Comparing iterations

```bash
# Compare schemas between two runs
npx cms-sim diff --old=output-v1/content-types/ --new=output-v2/content-types/

# Compare full simulation reports
npx cms-sim diff --old=output-v1/ --new=output-v2/
```

---

## Step 9: Set up Contentful

Once you're happy with the simulation output, it's time to set up Contentful for the real import.

### 9.1 Create a Contentful account

1. Go to [https://www.contentful.com/sign-up/](https://www.contentful.com/sign-up/)
2. Sign up for a free Community plan (includes 1 space, 25K entries, 48 content types)
3. Create a new **space** (e.g., "My Blog")

### 9.2 Install the Contentful CLI

```bash
npm install -g contentful-cli

# Authenticate
contentful login
```

### 9.3 Install contentful-migration

This is the tool for creating content types programmatically:

```bash
npm install -g contentful-migration
```

### 9.4 Install contentful-import

For bulk importing entries:

```bash
npm install -g contentful-import
```

### 9.5 Get your API keys

1. In the Contentful web app, go to **Settings → API keys**
2. Create a new API key (or use the example one)
3. Note these values:
   - **Space ID** — e.g., `abc123xyz`
   - **Content Delivery API (CDA) access token** — for reading published content
   - **Content Management API (CMA) token** — go to **Settings → CMA tokens → Generate personal token**. This is needed for creating content types and importing entries.

### 9.6 Set environment variables

```bash
export CONTENTFUL_SPACE_ID=abc123xyz
export CONTENTFUL_MANAGEMENT_TOKEN=CFPAT-your-cma-token-here
```

### 9.7 Create content types in Contentful

You have two options:

#### Option A: Manual (via Contentful web app)

1. Go to **Content Model** in the Contentful web app
2. Create each content type matching your `schemas/*.js` definitions
3. Add all fields with the correct types, validations, and localization settings

Use the generated `output/content-types/*.json` files as your reference — they're in Contentful's native format.

#### Option B: Contentful Migration script (recommended)

Create a migration script from your schemas. Example `migrations/01-create-content-types.cjs`:

```js
// Generated from schemas/blogPost.js
module.exports = function(migration) {
  const blogPost = migration.createContentType('blogPost', {
    name: 'Blog Post',
    description: 'Migrated from WordPress posts',
    displayField: 'title',
  });

  blogPost.createField('title', { name: 'Title', type: 'Symbol', required: true, localized: true });
  blogPost.createField('slug', { name: 'Slug', type: 'Symbol', required: true });
  blogPost.createField('content', { name: 'Content', type: 'RichText', localized: true });
  blogPost.createField('excerpt', { name: 'Excerpt', type: 'Text', localized: true });
  blogPost.createField('featuredImage', { name: 'Featured Image', type: 'Link', linkType: 'Asset' });
  blogPost.createField('author', { name: 'Author', type: 'Link', linkType: 'Entry',
    validations: [{ linkContentType: ['author'] }] });
  blogPost.createField('category', { name: 'Category', type: 'Link', linkType: 'Entry',
    validations: [{ linkContentType: ['category'] }] });
  blogPost.createField('tags', { name: 'Tags', type: 'Array',
    items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['tag'] }] } });
  blogPost.createField('publishDate', { name: 'Publish Date', type: 'Date', required: true });
  blogPost.createField('status', { name: 'Status', type: 'Symbol',
    validations: [{ in: ['draft', 'published', 'archived'] }] });
  blogPost.createField('seoTitle', { name: 'SEO Title', type: 'Symbol', localized: true });
  blogPost.createField('seoDescription', { name: 'SEO Description', type: 'Text', localized: true });

  // Repeat for author, category, tag, page...
};
```

Run it:

```bash
contentful space migration --space-id=$CONTENTFUL_SPACE_ID migrations/01-create-content-types.cjs
```

### 9.8 Configure locales (if multi-language)

If your WordPress site has multiple languages (e.g., via WPML or Polylang):

1. Go to **Settings → Locales** in Contentful
2. Add each locale (e.g., `es-MX`, `fr-FR`)
3. Set the default locale (e.g., `en-US`)

---

## Step 10: Import into Contentful

### 10.1 Prepare the import file

The simulator's `output/entries/` contains entry JSON files. To import them, you need to convert them to Contentful's import format. Create a script:

```js
// prepare-import.js
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_DIR = './output';
const entries = [];

// Read all entry files
const entryDirs = fs.readdirSync(path.join(OUTPUT_DIR, 'entries'));
for (const ctDir of entryDirs) {
  const ctPath = path.join(OUTPUT_DIR, 'entries', ctDir);
  if (!fs.statSync(ctPath).isDirectory()) continue;

  for (const file of fs.readdirSync(ctPath).filter(f => f.endsWith('.json'))) {
    const entry = JSON.parse(fs.readFileSync(path.join(ctPath, file), 'utf-8'));
    entries.push({
      sys: {
        id: entry.sys?.id || entry.id,
        contentType: { sys: { type: 'Link', linkType: 'ContentType', id: ctDir } },
        type: 'Entry',
      },
      fields: entry.fields,
    });
  }
}

// Write import file
const importData = {
  entries,
  assets: [],          // Add assets here if needed
  contentTypes: [],    // Already created via migration
  locales: [],         // Already configured in Contentful
};

fs.writeFileSync('contentful-import.json', JSON.stringify(importData, null, 2));
console.log(`Prepared ${entries.length} entries for import`);
```

```bash
node prepare-import.js
```

### 10.2 Run the import

```bash
contentful space import \
  --space-id=$CONTENTFUL_SPACE_ID \
  --management-token=$CONTENTFUL_MANAGEMENT_TOKEN \
  --content-file=contentful-import.json
```

### 10.3 Verify with pull-back

After importing, you can pull the content back and compare:

```bash
# Pull from Contentful
npx cms-sim pull \
  --space-id=$CONTENTFUL_SPACE_ID \
  --access-token=$CONTENTFUL_CDA_TOKEN \
  --include-entries \
  --output=pulled/

# Simulate the pulled data
npx cms-sim --schemas=pulled/schemas/ --input=pulled/data/entries.ndjson --output=pulled/output/ --name='Post-Import Verification' --open

# Compare with original simulation
npx cms-sim diff --old=output/ --new=pulled/output/
```

---

## Understanding warnings

| Warning | Meaning | Action |
|---------|---------|--------|
| `HTML_TO_RICHTEXT_CONVERTED` | HTML string auto-converted to Contentful Rich Text JSON | Expected for `RichText` fields with HTML content. Verify the conversion in the Content Browser. |
| `ASSET_FIELD_NOT_LINKED` | A `Link:Asset` field has a value that isn't a proper asset reference | Fix your transform to produce `{ sys: { type: 'Link', linkType: 'Asset', id: '...' } }` |
| `NULL_FIELD` | A field has a `null` value | Usually fine — means the WordPress source didn't have data for that field |
| `FIELD_NOT_IN_DEFINITION` | Entry has a field not defined in the schema | Either add the field to your schema or add a transform that maps/removes it |
| `REQUIRED_FIELD_MISSING` | A required field is missing from the entry | Fix your transform or mark the field as `required: false` |
| `MISSING_CONTENT_TYPE` | Document has no `contentType` property | Check your data format or add a transform |

---

## Data format reference

### NDJSON document format

Each line in the `.ndjson` file is a JSON object:

```json
{"contentType":"blogPost","id":"post-123","locale":"en","path":"2024/03/my-post","data":{"title":"My Post","slug":"my-post","content":"<p>HTML content here</p>","excerpt":"Short description","featured_image":"img-456","author_id":"user-1","category_id":"cat-1","tag_ids":["tag-1","tag-2"],"date":"2024-03-15","status":"publish"}}
```

### Required fields per document

| Field | Type | Description |
|-------|------|-------------|
| `contentType` | `string` | Maps to a schema ID (e.g., `'blogPost'`) |
| `id` | `string` | Unique identifier for the entry |
| `locale` | `string` | Locale code (e.g., `'en'`, `'en-US'`) |
| `path` | `string` | Source path/slug (used for deterministic ID generation) |
| `data` | `object` | Raw fields from WordPress |

### WXR (XML) format

The simulator reads standard WordPress XML exports directly — no conversion needed. It auto-detects `.xml` files and extracts:

- Posts → `contentType: 'post'`
- Pages → `contentType: 'page'`
- Attachments → `contentType: 'attachment'`
- Authors → `contentType: 'author'`
- Categories → `contentType: 'category'`
- Tags → `contentType: 'tag'`

Gutenberg block comments (`<!-- wp:paragraph -->`, etc.) are automatically stripped, leaving clean HTML.

---

## FAQ

### Can I migrate custom post types (ACF, WooCommerce, etc.)?

Yes. Custom post types appear in the WXR export with their registered type name. Add a schema and transform for each one. The `scaffold` command auto-detects them.

### How does Rich Text conversion work?

When a field has type `RichText` in your schema and the source value is HTML, the simulator automatically converts it to Contentful Rich Text JSON using a zero-dependency parser. Supported elements: headings, paragraphs, lists, bold/italic/underline/code, links, images, tables, blockquotes.

### What about images and media?

The simulator tracks asset references but doesn't download files. For the actual import, you'll need to:
1. Upload media to Contentful (via the web app, CLI, or management API)
2. Map the WordPress media IDs to Contentful asset IDs in your transforms

### Can I simulate multi-language content?

Yes. If your WordPress site uses WPML or Polylang, export each language and create documents with the appropriate `locale` value. Then run:

```bash
npx cms-sim --schemas=schemas/ --input=data/export.ndjson --transforms=transforms/ --locales=en-US,es-MX --output=output/
```

### How do I handle WordPress meta fields?

The WXR reader extracts `postmeta` fields into `data.meta`. Access them in transforms:

```js
registry.register('blogPost', (doc, locale) => {
  const d = doc.data || {};
  const meta = d.meta || {};
  return {
    fields: {
      // ...
      customField: { [locale]: meta.my_custom_meta_key || null },
    },
  };
});
```
