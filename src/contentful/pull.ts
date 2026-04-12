/**
 * Content Model Simulator — Contentful Pull
 *
 * Downloads content types, locales, and optionally entries from
 * a Contentful space using the Content Delivery API (read-only).
 *
 * Uses Node.js built-in fetch (Node >= 18). Zero external dependencies.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentTypeDefinition, ContentTypeField, Document, PullOptions, PullResult } from '../types.js';

// ── API helpers ──────────────────────────────────────────────────

const CDA_BASE = 'https://cdn.contentful.com';
const CMA_BASE = 'https://api.contentful.com';

async function fetchAll(
  url: string,
  headers: Record<string, string>,
  { verbose = false, maxItems = Infinity, onProgress }: { verbose?: boolean; maxItems?: number; onProgress?: (fetched: number, total: number) => void } = {},
): Promise<any[]> {
  const items: any[] = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const separator = url.includes('?') ? '&' : '?';
    const pagedUrl = `${url}${separator}limit=${limit}&skip=${skip}`;
    if (verbose) console.log(`  GET ${pagedUrl}`);

    const res = await fetch(pagedUrl, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Contentful API ${res.status}: ${body}`);
    }

    const data = await res.json();
    items.push(...(data.items || []));

    if (onProgress) onProgress(items.length, data.total || items.length);

    if (items.length >= maxItems) break;
    if (items.length >= (data.total || 0)) break;
    skip += limit;
  }

  return items.slice(0, maxItems);
}

// ── Schema conversion ────────────────────────────────────────────

function toSchema(ct: any): ContentTypeDefinition {
  return {
    id: ct.sys.id,
    name: ct.name,
    description: ct.description || undefined,
    displayField: ct.displayField || undefined,
    fields: (ct.fields || []).map((f: any) => {
      const field: Record<string, any> = {
        id: f.id,
        name: f.name,
        type: f.type,
      };

      // Only include non-default values to keep schemas clean
      if (f.required) field.required = true;
      if (f.localized) field.localized = true;
      if (f.disabled) field.disabled = true;
      if (f.omitted) field.omitted = true;

      // Link type
      if (f.linkType) field.linkType = f.linkType;

      // Array items
      if (f.items) {
        field.items = { type: f.items.type };
        if (f.items.linkType) field.items.linkType = f.items.linkType;
        if (f.items.validations?.length) field.items.validations = f.items.validations;
      }

      // Validations
      if (f.validations?.length) field.validations = f.validations;

      // Default value
      if (f.defaultValue !== undefined && f.defaultValue !== null) {
        field.defaultValue = f.defaultValue;
      }

      return field as ContentTypeField;
    }),
  };
}

function toDocuments(entry: any, locales: string[]): Document[] {
  const ctId = entry.sys.contentType?.sys?.id || 'unknown';
  const docs: Document[] = [];

  for (const locale of locales) {
    const data: Record<string, unknown> = {};
    let hasData = false;

    for (const [fieldId, localeValues] of Object.entries(entry.fields || {})) {
      if ((localeValues as Record<string, unknown>)[locale] !== undefined) {
        data[fieldId] = (localeValues as Record<string, unknown>)[locale];
        hasData = true;
      }
    }

    if (hasData) {
      docs.push({
        contentType: ctId,
        locale,
        id: entry.sys.id,
        path: `/${ctId}/${entry.sys.id}`,
        data,
      });
    }
  }

  return docs;
}

// ── Main pull function ───────────────────────────────────────────

export async function pull(options: PullOptions): Promise<PullResult> {
  const {
    spaceId,
    accessToken,
    environment = 'master',
    outputDir,
    includeEntries = false,
    maxEntries = 1000,
    useCMA = false,
    verbose = false,
  } = options;

  if (!spaceId) throw new Error('Missing --space-id (or CONTENTFUL_SPACE_ID env var)');
  if (!accessToken) throw new Error('Missing --access-token (or CONTENTFUL_ACCESS_TOKEN env var)');

  const base = useCMA ? CMA_BASE : CDA_BASE;
  const envUrl = `${base}/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environment)}`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  // ── Fetch locales ──────────────────────────────────────────
  if (verbose) console.log('\nFetching locales...');
  const localesRaw = await fetchAll(`${envUrl}/locales`, headers, { verbose });
  const locales = localesRaw.map((l: any) => l.code as string);
  const defaultLocale = localesRaw.find((l: any) => l.default)?.code || locales[0] || 'en';
  if (verbose) console.log(`  Found ${locales.length} locale(s): ${locales.join(', ')}`);

  // ── Fetch content types ────────────────────────────────────
  if (verbose) console.log('\nFetching content types...');
  const contentTypesRaw = await fetchAll(`${envUrl}/content_types`, headers, { verbose });
  const schemas = contentTypesRaw.map(toSchema);
  if (verbose) console.log(`  Found ${schemas.length} content type(s)`);

  // ── Optionally fetch entries ───────────────────────────────
  let documents: Document[] | null = null;
  if (includeEntries) {
    if (verbose) console.log('\nFetching entries...');
    const entriesRaw = await fetchAll(
      `${envUrl}/entries?locale=*`,
      headers,
      {
        verbose,
        maxItems: maxEntries,
        onProgress: (fetched, total) => {
          if (!verbose) process.stdout.write(`\r  Fetching entries... ${fetched}/${total}`);
        },
      },
    );
    if (!verbose) process.stdout.write('\n');

    documents = entriesRaw.flatMap(entry => toDocuments(entry, locales));
    if (verbose) {
      console.log(`  Fetched ${entriesRaw.length} entries → ${documents.length} locale-documents`);
    }
  }

  // ── Write to disk ──────────────────────────────────────────
  if (outputDir) {
    const schemasDir = join(outputDir, 'schemas');
    mkdirSync(schemasDir, { recursive: true });

    // Write each content type as a .js schema file
    for (const schema of schemas) {
      const filePath = join(schemasDir, `${schema.id}.js`);
      const content = `/**\n * ${schema.name}\n * Pulled from Contentful space ${spaceId} (${environment})\n */\nexport default ${JSON.stringify(schema, null, 2)};\n`;
      writeFileSync(filePath, content, 'utf-8');
    }

    // Write locales config
    const localeConfig = {
      baseLocale: defaultLocale,
      locales,
      pulledAt: new Date().toISOString(),
      space: spaceId,
      environment,
    };
    writeFileSync(join(outputDir, 'contentful-space.json'), JSON.stringify(localeConfig, null, 2) + '\n', 'utf-8');

    // Write entries as NDJSON
    if (documents && documents.length > 0) {
      const dataDir = join(outputDir, 'data');
      mkdirSync(dataDir, { recursive: true });
      const ndjson = documents.map(d => JSON.stringify(d)).join('\n') + '\n';
      writeFileSync(join(dataDir, 'entries.ndjson'), ndjson, 'utf-8');
    }
  }

  return { schemas, locales, defaultLocale, documents };
}
