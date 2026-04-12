/**
 * Content Model Simulator — WordPress WXR Scaffold Generator
 *
 * Analyzes a parsed WXR export and generates:
 * - Contentful schema files (.js) for each discovered content type
 * - A TransformerRegistry file (.js) mapping WP fields → Contentful fields
 * - A README with customization instructions
 *
 * The generated files are a working starting point — users can
 * immediately simulate and then customize for ACF, WooCommerce,
 * custom post types, etc.
 */

import type { Document } from '../types.js';
import type { WXRResult } from './wxr-reader.js';

// ── Types ────────────────────────────────────────────────────────

export interface ScaffoldAnalysis {
  /** Discovered content types with their fields and inferred Contentful types. */
  contentTypes: AnalyzedContentType[];
  /** WordPress content types to skip (attachments, nav items, etc.). */
  skippedTypes: string[];
  /** Site metadata from the WXR export. */
  site: { title: string; url: string; language: string };
}

export interface AnalyzedContentType {
  /** WordPress source type (e.g., 'post', 'page', 'product'). */
  sourceType: string;
  /** Contentful content type ID (camelCase). */
  contentfulId: string;
  /** Human-readable name for display. */
  displayName: string;
  /** Discovered fields with inferred Contentful type. */
  fields: AnalyzedField[];
  /** Number of documents of this type found in the export. */
  documentCount: number;
}

export interface AnalyzedField {
  /** Field ID (camelCase, Contentful-safe). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Inferred Contentful field type. */
  type: string;
  /** For Link fields. */
  linkType?: string;
  /** For Array fields. */
  items?: { type: string; linkType?: string };
  /** Whether the field appears in most documents (>50%). */
  required: boolean;
  /** Whether this field is localizable. */
  localized: boolean;
  /** Original WordPress field name (if different from id). */
  sourceField?: string;
}

export interface ScaffoldOptions {
  /** Map specific WP types to custom Contentful IDs. e.g. { post: 'blogPost' } */
  typeMap?: Record<string, string>;
  /** WP types to skip (merged with default skips). */
  skipTypes?: string[];
  /** Whether to include meta fields from postmeta. Default: true. */
  includeMeta?: boolean;
}

export interface ScaffoldOutput {
  /** Analysis results. */
  analysis: ScaffoldAnalysis;
  /** Generated files: path → content. */
  files: Map<string, string>;
}

// ── Constants ────────────────────────────────────────────────────

const DEFAULT_SKIP_TYPES = ['attachment', 'nav_menu_item', 'wp_navigation', 'wp_template', 'wp_template_part', 'wp_global_styles'];

const DEFAULT_TYPE_MAP: Record<string, string> = {
  post: 'blogPost',
  page: 'page',
  author: 'author',
  category: 'category',
  tag: 'tag',
};

/** Well-known fields and their Contentful type inference. */
const FIELD_TYPE_HINTS: Record<string, { type: string; linkType?: string; items?: { type: string }; localized?: boolean }> = {
  title: { type: 'Symbol', localized: true },
  name: { type: 'Symbol', localized: true },
  displayName: { type: 'Symbol' },
  slug: { type: 'Symbol' },
  body: { type: 'RichText', localized: true },
  content: { type: 'RichText', localized: true },
  excerpt: { type: 'Text', localized: true },
  description: { type: 'Text', localized: true },
  publishDate: { type: 'Date' },
  date: { type: 'Date' },
  status: { type: 'Symbol' },
  author: { type: 'Symbol' },
  creator: { type: 'Symbol' },
  email: { type: 'Symbol' },
  login: { type: 'Symbol' },
  firstName: { type: 'Symbol' },
  lastName: { type: 'Symbol' },
  url: { type: 'Symbol' },
  mimeType: { type: 'Symbol' },
  parent: { type: 'Symbol' },
  categories: { type: 'Array', items: { type: 'Symbol' } },
  tags: { type: 'Array', items: { type: 'Symbol' } },
};

// ── Public API ───────────────────────────────────────────────────

/**
 * Analyze a parsed WXR result and discover the content model.
 */
export function analyzeWXR(wxr: WXRResult, options: ScaffoldOptions = {}): ScaffoldAnalysis {
  const skipTypes = new Set([...DEFAULT_SKIP_TYPES, ...(options.skipTypes || [])]);
  const typeMap = { ...DEFAULT_TYPE_MAP, ...(options.typeMap || {}) };
  const includeMeta = options.includeMeta !== false;

  // Group documents by contentType
  const groups = new Map<string, Document[]>();
  const skippedTypes = new Set<string>();

  for (const doc of wxr.documents) {
    const ct = doc.contentType;
    if (skipTypes.has(ct)) {
      skippedTypes.add(ct);
      continue;
    }
    if (!groups.has(ct)) groups.set(ct, []);
    groups.get(ct)!.push(doc);
  }

  const contentTypes: AnalyzedContentType[] = [];

  for (const [sourceType, docs] of groups) {
    const contentfulId = typeMap[sourceType] || toCamelCase(sourceType);
    const displayName = typeMap[sourceType]
      ? toDisplayName(typeMap[sourceType])
      : toDisplayName(sourceType);

    const fields = analyzeFields(docs, sourceType, includeMeta);

    contentTypes.push({
      sourceType,
      contentfulId,
      displayName,
      fields,
      documentCount: docs.length,
    });
  }

  // Sort: standard types first (post, page, author, category, tag), then custom
  const standardOrder = ['post', 'page', 'author', 'category', 'tag'];
  contentTypes.sort((a, b) => {
    const ai = standardOrder.indexOf(a.sourceType);
    const bi = standardOrder.indexOf(b.sourceType);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.sourceType.localeCompare(b.sourceType);
  });

  return {
    contentTypes,
    skippedTypes: [...skippedTypes].sort(),
    site: {
      title: wxr.site.title,
      url: wxr.site.url,
      language: wxr.site.language,
    },
  };
}

/**
 * Generate scaffold files from analysis results.
 */
export function generateScaffold(analysis: ScaffoldAnalysis): ScaffoldOutput {
  const files = new Map<string, string>();

  // Generate schema files
  for (const ct of analysis.contentTypes) {
    const filename = `schemas/${ct.contentfulId}.js`;
    files.set(filename, generateSchemaFile(ct));
  }

  // Generate transforms file
  files.set('transforms/wordpress.js', generateTransformFile(analysis));

  // Generate README
  files.set('README.md', generateReadme(analysis));

  return { analysis, files };
}

/**
 * Analyze WXR and generate scaffold in one step.
 */
export function scaffoldFromWXR(wxr: WXRResult, options: ScaffoldOptions = {}): ScaffoldOutput {
  const analysis = analyzeWXR(wxr, options);
  return generateScaffold(analysis);
}

// ── Field Analysis ───────────────────────────────────────────────

function analyzeFields(docs: Document[], sourceType: string, includeMeta: boolean): AnalyzedField[] {
  // Collect all field keys and their values across documents
  const fieldStats = new Map<string, { count: number; values: unknown[] }>();

  for (const doc of docs) {
    const data = doc.data || doc.fields || {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'meta' && typeof value === 'object' && value && !Array.isArray(value)) {
        // Expand meta fields
        if (includeMeta) {
          for (const [metaKey, metaVal] of Object.entries(value as Record<string, unknown>)) {
            const fieldKey = `meta_${metaKey}`;
            if (!fieldStats.has(fieldKey)) fieldStats.set(fieldKey, { count: 0, values: [] });
            const stat = fieldStats.get(fieldKey)!;
            stat.count++;
            if (stat.values.length < 10) stat.values.push(metaVal);
          }
        }
        continue;
      }
      if (!fieldStats.has(key)) fieldStats.set(key, { count: 0, values: [] });
      const stat = fieldStats.get(key)!;
      stat.count++;
      if (stat.values.length < 10) stat.values.push(value);
    }
  }

  const fields: AnalyzedField[] = [];
  const totalDocs = docs.length;

  for (const [fieldKey, stat] of fieldStats) {
    // Skip empty fields that appear in very few documents
    if (stat.count === 0) continue;

    const id = sanitizeFieldId(fieldKey);
    const hint = FIELD_TYPE_HINTS[id] || FIELD_TYPE_HINTS[fieldKey];
    const inferred = hint || inferFieldType(fieldKey, stat.values);

    const field: AnalyzedField = {
      id,
      name: toFieldDisplayName(fieldKey),
      type: inferred.type,
      required: stat.count / totalDocs > 0.5,
      localized: inferred.localized || false,
    };

    if (inferred.linkType) field.linkType = inferred.linkType;
    if (inferred.items) field.items = inferred.items;
    if (id !== fieldKey) field.sourceField = fieldKey;

    fields.push(field);
  }

  // Sort: required first, then alphabetical
  fields.sort((a, b) => {
    if (a.required && !b.required) return -1;
    if (!a.required && b.required) return 1;
    // Keep title/name/slug at top
    const priority = ['title', 'name', 'displayName', 'slug', 'body', 'content'];
    const ai = priority.indexOf(a.id);
    const bi = priority.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.id.localeCompare(b.id);
  });

  return fields;
}

function inferFieldType(key: string, values: unknown[]): { type: string; linkType?: string; items?: { type: string }; localized?: boolean } {
  const nonNull = values.filter(v => v != null && v !== '');
  if (nonNull.length === 0) return { type: 'Symbol' };

  // Check if all values are arrays
  if (nonNull.every(v => Array.isArray(v))) {
    return { type: 'Array', items: { type: 'Symbol' } };
  }

  // Check if all values are booleans
  if (nonNull.every(v => typeof v === 'boolean')) {
    return { type: 'Boolean' };
  }

  // Check if all values are numbers (integers)
  if (nonNull.every(v => typeof v === 'number' && Number.isInteger(v))) {
    return { type: 'Integer' };
  }

  // Check if all values are numbers
  if (nonNull.every(v => typeof v === 'number')) {
    return { type: 'Number' };
  }

  // Check for objects (JSON)
  if (nonNull.every(v => typeof v === 'object' && !Array.isArray(v))) {
    return { type: 'Object' };
  }

  // String analysis
  const strings = nonNull.filter(v => typeof v === 'string') as string[];
  if (strings.length > 0) {
    // Date detection
    if (strings.every(s => /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{4}-\d{2}-\d{2}T/.test(s))) {
      return { type: 'Date' };
    }

    // Long HTML content → RichText
    const avgLen = strings.reduce((s, v) => s + v.length, 0) / strings.length;
    const hasHTML = strings.some(s => /<[a-z][\s\S]*?>/i.test(s));
    if (hasHTML && avgLen > 200) {
      return { type: 'RichText', localized: true };
    }

    // Long text (>256 avg) → Text
    if (avgLen > 256) {
      return { type: 'Text', localized: true };
    }
  }

  return { type: 'Symbol' };
}

// ── File Generators ──────────────────────────────────────────────

function generateSchemaFile(ct: AnalyzedContentType): string {
  const fieldsCode = ct.fields.map(f => {
    const parts: string[] = [
      `id: '${f.id}'`,
      `name: '${escapeSingleQuote(f.name)}'`,
      `type: '${f.type}'`,
    ];
    if (f.linkType) parts.push(`linkType: '${f.linkType}'`);
    if (f.items) {
      let itemsStr = `{ type: '${f.items.type}'`;
      if (f.items.linkType) itemsStr += `, linkType: '${f.items.linkType}'`;
      itemsStr += ' }';
      parts.push(`items: ${itemsStr}`);
    }
    if (f.required) parts.push('required: true');
    if (f.localized) parts.push('localized: true');
    return `    { ${parts.join(', ')} },`;
  }).join('\n');

  const displayField = ct.fields.find(f => f.id === 'title' || f.id === 'name')?.id || ct.fields[0]?.id || 'title';

  return `/**
 * ${ct.displayName} content type
 *
 * Auto-generated from WordPress export (${ct.sourceType} → ${ct.contentfulId}).
 * ${ct.documentCount} document${ct.documentCount !== 1 ? 's' : ''} found in export.
 *
 * Customize this file to match your desired Contentful content model:
 * - Adjust field types (e.g., Symbol → Link for relationships)
 * - Add validations (e.g., { in: ['draft', 'published'] } for status)
 * - Remove fields you don't need
 * - Add new fields not present in WordPress
 *
 * Then run: cms-sim --schemas=schemas/ --input=<your-export.xml> --transforms=transforms/ --open
 */
export default {
  id: '${ct.contentfulId}',
  name: '${escapeSingleQuote(ct.displayName)}',
  displayField: '${displayField}',
  fields: [
${fieldsCode}
  ],
};
`;
}

function generateTransformFile(analysis: ScaffoldAnalysis): string {
  const registrations = analysis.contentTypes.map(ct => {
    const fieldMappings = ct.fields.map(f => {
      const source = f.sourceField || f.id;
      if (f.type === 'Array') {
        return `        ${f.id}: { [locale]: d.${source} || [] },`;
      }
      return `        ${f.id}: { [locale]: d.${source}${f.required ? '' : " || ''"} },`;
    }).join('\n');

    return `  // ${ct.sourceType} → ${ct.contentfulId}
  transformers.register('${ct.sourceType}', (doc, locale) => {
    const d = doc.data || {};
    return {
      _metadata: {
        contentType: '${ct.contentfulId}',
        entryId: generateEntryId('${ct.contentfulId}', \`\${d.slug || d.title || doc.id}-\${locale}\`),
        sourceType: '${ct.sourceType}',
        sourcePath: doc.path,
      },
      fields: {
${fieldMappings}
      },
    };
  }, '${ct.contentfulId}');`;
  }).join('\n\n');

  const skipLine = analysis.skippedTypes.length > 0
    ? `\n  // Skip WordPress-internal types\n  transformers.skip(${JSON.stringify(analysis.skippedTypes)});\n`
    : '';

  return `/**
 * WordPress → Contentful transformer
 *
 * Auto-generated from WordPress export.
 * Maps WordPress post types to Contentful content types:
${analysis.contentTypes.map(ct => ` *   ${ct.sourceType.padEnd(14)} → ${ct.contentfulId}`).join('\n')}
${analysis.skippedTypes.length > 0 ? ` *\n * Skipped types: ${analysis.skippedTypes.join(', ')}` : ''}
 *
 * Customize this file to:
 * - Change field mappings
 * - Add computed fields
 * - Convert relationships to Link:Entry references
 * - Handle ACF or custom plugin fields
 */

import { generateEntryId } from 'content-model-simulator';

export function register(transformers) {
${skipLine}
${registrations}
}
`;
}

function generateReadme(analysis: ScaffoldAnalysis): string {
  const ctTable = analysis.contentTypes.map(ct =>
    `| ${ct.sourceType} | ${ct.contentfulId} | ${ct.documentCount} | ${ct.fields.length} fields |`
  ).join('\n');

  const skippedNote = analysis.skippedTypes.length > 0
    ? `\n### Skipped Types\nThese WordPress types were excluded: ${analysis.skippedTypes.map(t => `\`${t}\``).join(', ')}\n`
    : '';

  return `# WordPress → Contentful Migration

Auto-generated scaffold from **${escapeMd(analysis.site.title)}** (${escapeMd(analysis.site.url)}).

## Content Model

| WordPress Type | Contentful Type | Documents | Details |
|---------------|-----------------|-----------|---------|
${ctTable}
${skippedNote}
## Quick Start

\`\`\`bash
# 1. Preview the migration (generates Content Browser + validation report)
npx cms-sim --schemas=schemas/ --input=<your-export.xml> --transforms=transforms/ --open

# 2. Watch mode — auto-reload on schema/transform changes
npx cms-sim --schemas=schemas/ --input=<your-export.xml> --transforms=transforms/ --watch --open

# 3. Validate only (CI-friendly)
npx cms-sim validate --schemas=schemas/ --input=<your-export.xml> --transforms=transforms/
\`\`\`

## Customization Guide

### Schemas (\`schemas/\`)
Each \`.js\` file defines a Contentful content type. Common changes:

- **Change field types**: \`Symbol\` → \`Link\` (for relationships), \`Symbol\` → \`RichText\` (for rich content)
- **Add validations**: \`validations: [{ in: ['draft', 'published'] }]\`
- **Mark fields as localized**: \`localized: true\` (for multi-language content)
- **Remove unused fields**: Delete fields you don't want in Contentful
- **Add new fields**: Fields not in WordPress but needed in Contentful

### Transforms (\`transforms/wordpress.js\`)
Maps WordPress fields to Contentful fields. Common changes:

- **Convert to Link:Entry**: Replace string author with \`createLink('Entry', authorId)\`
- **Combine fields**: Merge first/last name into a single field
- **ACF fields**: Access via \`d.meta_fieldname\` (ACF stores in postmeta)
- **Skip types**: Add to \`transformers.skip()\` to exclude

### Example: Convert author string to Link:Entry

\`\`\`js
// Before (auto-generated):
author: { [locale]: d.author },

// After (manual customization):
import { generateEntryId, createLink } from 'content-model-simulator';
author: { [locale]: createLink('Entry', generateEntryId('author', d.author)) },
\`\`\`

## Supported Field Types

| Type | Description |
|------|-------------|
| \`Symbol\` | Short text (max 256 chars) |
| \`Text\` | Long text |
| \`RichText\` | Rich text — HTML auto-converted to Contentful format |
| \`Integer\` | Whole number |
| \`Number\` | Decimal number |
| \`Date\` | ISO 8601 date |
| \`Boolean\` | True/false |
| \`Object\` | Arbitrary JSON |
| \`Link\` | Reference to Entry or Asset (\`linkType: 'Entry'\\|'Asset'\`) |
| \`Array\` | Array of values (\`items: { type: ... }\`) |

## Next Steps

1. Review and customize \`schemas/\` — adjust field types and add validations
2. Review and customize \`transforms/wordpress.js\` — refine field mappings
3. Run the simulation with \`--open\` to preview in the Content Browser
4. Iterate until the Content Browser shows your content correctly
5. The final schemas and transforms are your migration blueprint
`;
}

// ── Helpers ──────────────────────────────────────────────────────

function sanitizeFieldId(key: string): string {
  // Convert meta_field_name to metaFieldName, publish-date to publishDate, etc.
  return key
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/_/g, '')
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

function toCamelCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, c => c.toLowerCase());
}

function toDisplayName(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function toFieldDisplayName(key: string): string {
  // meta_field_name → Meta Field Name
  return key
    .replace(/^meta_/, 'Meta: ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function escapeSingleQuote(str: string): string {
  return str.replace(/'/g, "\\'");
}

function escapeMd(str: string): string {
  return str.replace(/[|\\`*_{}[\]()#+\-.!>]/g, '\\$&');
}
