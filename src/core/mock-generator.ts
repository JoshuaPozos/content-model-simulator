/**
 * Content Model Simulator — Mock Data Generator
 *
 * Generates realistic sample entries from content type definitions.
 * Used when no --input is provided, so users can preview their
 * content model with live data in the Content Browser.
 */

import { generateEntryId } from '../transform/helpers.js';
import type { ContentTypeDefinition, ContentTypeField, Document, Asset, MockDataOptions, MockDataResult, SchemaLike, SchemaInput } from '../types.js';

/**
 * Field-type generators. Each returns a plausible sample value.
 */
const SAMPLE_TEXT = [
  'The quick brown fox jumps over the lazy dog.',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Content modeling is the foundation of any headless CMS project.',
  'A well-defined content model makes localization straightforward.',
  'This field demonstrates how text content appears in Contentful.',
];

const SAMPLE_TITLES = [
  'Welcome to our platform',
  'Getting started guide',
  'Product announcement',
  'Behind the scenes',
  'Tips and best practices',
  'Year in review',
  'Meet the team',
  'Frequently asked questions',
];

const SAMPLE_NAMES = [
  'Alice Johnson', 'Carlos Rivera', 'Yuki Tanaka',
  'Marie Dupont', "James O'Brien", 'Priya Sharma',
];

const SAMPLE_SLUGS = [
  'welcome', 'getting-started', 'announcement',
  'behind-the-scenes', 'tips-and-tricks', 'year-in-review',
];

const SAMPLE_URLS = [
  'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800',
  'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=800',
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
];

function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length];
}

function generateFieldValue(
  fieldDef: ContentTypeField,
  seed: number,
  context: { locale?: string; allSchemas?: Record<string, ContentTypeDefinition>; mockEntryIds?: Record<string, string[]> } = {},
): unknown {
  const { locale = 'en', allSchemas = {}, mockEntryIds = {} } = context;
  const type = fieldDef.type;
  const linkType = fieldDef.linkType || fieldDef.items?.linkType;
  const fieldId = (fieldDef.id || '').toLowerCase();

  switch (type) {
    case 'Symbol': {
      // Heuristic: pick appropriate samples based on field name
      if (fieldId.includes('slug') || fieldId.includes('url_slug'))
        return pick(SAMPLE_SLUGS, seed);
      if (fieldId.includes('email'))
        return `user${seed + 1}@example.com`;
      if (fieldId.includes('url') || fieldId.includes('link') || fieldId.includes('href'))
        return `https://example.com/page-${seed + 1}`;
      if (fieldId.includes('phone') || fieldId.includes('tel'))
        return `+1-555-${String(1000 + seed).slice(-4)}`;
      if (fieldId.includes('color') || fieldId.includes('colour'))
        return ['#4F46E5', '#059669', '#D97706', '#DC2626'][seed % 4];
      if (fieldId.includes('name') || fieldId.includes('author'))
        return pick(SAMPLE_NAMES, seed);
      // Selects: if there are validations with `in`, pick from those
      if (fieldDef.validations) {
        const inVal = fieldDef.validations.find(v => v.in);
        if (inVal?.in) return pick(inVal.in, seed);
      }
      return pick(SAMPLE_TITLES, seed);
    }

    case 'Text':
    case 'RichText': {
      const text = pick(SAMPLE_TEXT, seed);
      if (type === 'RichText') {
        return {
          nodeType: 'document',
          data: {},
          content: [{
            nodeType: 'paragraph',
            data: {},
            content: [{ nodeType: 'text', value: text, marks: [], data: {} }],
          }],
        };
      }
      // If field name suggests HTML
      if (fieldId.includes('body') || fieldId.includes('content') || fieldId.includes('description'))
        return `<p>${text}</p>\n<p>${pick(SAMPLE_TEXT, seed + 1)}</p>`;
      return text;
    }

    case 'Integer':
      return (seed + 1) * 10 + Math.floor(seed * 3.7) % 100;

    case 'Number':
      return Math.round(((seed + 1) * 12.5 + seed * 7.3) * 100) / 100;

    case 'Boolean':
      return seed % 2 === 0;

    case 'Date':
      return new Date(2026, seed % 12, (seed % 28) + 1).toISOString();

    case 'Object':
      return { key: `value-${seed + 1}`, enabled: true };

    case 'Location':
      return { lat: 19.4326 + seed * 0.01, lon: -99.1332 + seed * 0.01 };

    case 'Link': {
      if (linkType === 'Asset') {
        const assetId = `mock-asset-${seed + 1}`;
        return { sys: { type: 'Link', linkType: 'Asset', id: assetId } };
      }
      if (linkType === 'Entry') {
        // Try to find a matching CT and link to a mock entry
        const targetCTs = findLinkTargetCTs(fieldDef, allSchemas);
        if (targetCTs.length > 0) {
          const targetCT = pick(targetCTs, seed);
          const ids = mockEntryIds[targetCT] || [];
          if (ids.length > 0) {
            return { sys: { type: 'Link', linkType: 'Entry', id: pick(ids, seed) } };
          }
        }
        return { sys: { type: 'Link', linkType: 'Entry', id: `mock-entry-${seed + 1}` } };
      }
      return null;
    }

    case 'Array': {
      const itemType = fieldDef.items?.type;
      const itemLinkType = fieldDef.items?.linkType;
      const count = 2 + (seed % 2);

      if (itemType === 'Symbol') {
        // Tags-like
        const tags = ['featured', 'new', 'popular', 'trending', 'guide', 'tutorial', 'news'];
        return Array.from({ length: count }, (_, i) => pick(tags, seed + i));
      }
      if (itemType === 'Link' && itemLinkType === 'Entry') {
        const targetCTs = findLinkTargetCTs(fieldDef, allSchemas);
        if (targetCTs.length > 0) {
          return Array.from({ length: count }, (_, i) => {
            const ct = pick(targetCTs, seed + i);
            const ids = mockEntryIds[ct] || [];
            const id = ids.length > 0 ? pick(ids, seed + i) : `mock-entry-${seed + i + 1}`;
            return { sys: { type: 'Link', linkType: 'Entry', id } };
          });
        }
        return Array.from({ length: count }, (_, i) =>
          ({ sys: { type: 'Link', linkType: 'Entry', id: `mock-entry-${seed + i + 1}` } })
        );
      }
      if (itemType === 'Link' && itemLinkType === 'Asset') {
        return Array.from({ length: count }, (_, i) =>
          ({ sys: { type: 'Link', linkType: 'Asset', id: `mock-asset-${seed + i + 1}` } })
        );
      }
      return [];
    }

    default:
      return `sample-${type}-${seed}`;
  }
}

function findLinkTargetCTs(fieldDef: ContentTypeField, allSchemas: Record<string, ContentTypeDefinition>): string[] {
  const validations = fieldDef.validations || fieldDef.items?.validations || [];
  for (const v of validations) {
    if (v.linkContentType && v.linkContentType.length > 0) {
      return v.linkContentType;
    }
  }
  // No explicit constraint — return all known CTs
  return Object.keys(allSchemas);
}

export function generateMockData(
  schemas: SchemaInput,
  options: MockDataOptions = {},
): MockDataResult {
  const {
    entriesPerType = 3,
    baseLocale = 'en',
    locales = [baseLocale],
    name = 'mock',
  } = options;

  const allSchemas = typeof (schemas as SchemaLike).getAll === 'function'
    ? (schemas as SchemaLike).getAll!()
    : schemas as Record<string, ContentTypeDefinition>;
  const documents: Document[] = [];
  const assetIds = new Set<string>();

  // Pre-generate entry IDs so Link:Entry fields can reference them.
  // IDs are locale-independent — same entry has same ID across all locales.
  const mockEntryIds: Record<string, string[]> = {};
  for (const [ctId] of Object.entries(allSchemas)) {
    mockEntryIds[ctId] = [];
    for (let i = 0; i < entriesPerType; i++) {
      const path = `/${ctId}/${SAMPLE_SLUGS[i % SAMPLE_SLUGS.length]}`;
      const id = generateEntryId(ctId, path);
      mockEntryIds[ctId].push(id);
    }
  }

  let idCounter = 0;
  for (const [ctId, ctDef] of Object.entries(allSchemas)) {
    for (let i = 0; i < entriesPerType; i++) {
      const path = `/${ctId}/${SAMPLE_SLUGS[i % SAMPLE_SLUGS.length]}`;
      for (const locale of locales) {
        const data: Record<string, unknown> = {};

        for (const field of ctDef.fields || []) {
          const seed = idCounter + i * 7 + locales.indexOf(locale) * 3;
          const value = generateFieldValue(field, seed, {
            locale,
            allSchemas,
            mockEntryIds,
          });

          // Collect asset IDs
          collectAssetIds(value, assetIds);

          data[field.id] = value;
        }

        documents.push({
          contentType: ctId,
          locale,
          path,
          id: mockEntryIds[ctId][i],
          data,
        });
        idCounter++;
      }
    }
  }

  const assets: Asset[] = [...assetIds].map((assetId, i) => ({
    id: assetId,
    title: `Sample Image ${i + 1}`,
    file: {
      url: pick(SAMPLE_URLS, i),
      contentType: 'image/jpeg',
      fileName: `sample-image-${i + 1}.jpg`,
    },
  }));

  return { documents, assets };
}

function collectAssetIds(value: unknown, set: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if ((value as any).sys?.linkType === 'Asset') { set.add((value as any).sys.id); return; }
  if (Array.isArray(value)) { value.forEach(v => collectAssetIds(v, set)); return; }
  for (const v of Object.values(value as Record<string, unknown>)) collectAssetIds(v, set);
}
