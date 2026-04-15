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
import type { ContentTypeDefinition, ContentTypeField, Document, PullOptions, PullResult, PulledAsset } from '../types.js';

// ── API helpers ──────────────────────────────────────────────────

const CDA_BASE = 'https://cdn.contentful.com';
const CPA_BASE = 'https://preview.contentful.com';
const CMA_BASE = 'https://api.contentful.com';

async function fetchAll(
  url: string,
  headers: Record<string, string>,
  { verbose = false, maxItems = Infinity, usePreview = false, onProgress }: { verbose?: boolean; maxItems?: number; usePreview?: boolean; onProgress?: (fetched: number, total: number) => void } = {},
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
      if (res.status === 401 && usePreview) {
        throw new Error(`Contentful API 401 (Unauthorized). The --preview flag requires a Content Preview API (CPA) token, not a CDA token. Check your --access-token or CONTENTFUL_ACCESS_TOKEN.`);
      }
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
    managementToken,
    environment = 'master',
    outputDir,
    includeEntries = false,
    includeAssets = false,
    maxEntries = 1000,
    contentType,
    useCMA = false,
    usePreview = false,
    verbose = false,
  } = options;

  if (!spaceId) throw new Error('Missing --space-id (or CONTENTFUL_SPACE_ID env var)');
  if (!accessToken && !managementToken) throw new Error('Missing --access-token (or CONTENTFUL_ACCESS_TOKEN env var)');

  const base = useCMA ? CMA_BASE : (usePreview ? CPA_BASE : CDA_BASE);
  const envUrl = `${base}/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environment)}`;
  const headers = { Authorization: `Bearer ${accessToken || managementToken}` };

  // When a management token is provided, use CMA for content types to get full validations.
  // The CDA may omit editor-only validations (in, regexp, size, range, unique).
  const useCMAForTypes = !!(managementToken && !useCMA);
  const cmaEnvUrl = `${CMA_BASE}/spaces/${encodeURIComponent(spaceId)}/environments/${encodeURIComponent(environment)}`;
  const cmaHeaders = managementToken ? { Authorization: `Bearer ${managementToken}` } : headers;
  const typesUrl = useCMAForTypes ? cmaEnvUrl : envUrl;
  const typesHeaders = useCMAForTypes ? cmaHeaders : headers;

  // ── Fetch locales ──────────────────────────────────────────
  if (verbose) console.log('\nFetching locales...');
  const localesRaw = await fetchAll(`${envUrl}/locales`, headers, { verbose, usePreview });
  const locales = localesRaw.map((l: any) => l.code as string);
  const defaultLocale = localesRaw.find((l: any) => l.default)?.code || locales[0] || 'en';
  if (verbose) console.log(`  Found ${locales.length} locale(s): ${locales.join(', ')}`);

  // ── Fetch content types ────────────────────────────────────
  if (verbose) console.log(`\nFetching content types${useCMAForTypes ? ' (via CMA — includes all validations)' : ''}...`);
  const contentTypesRaw = await fetchAll(`${typesUrl}/content_types`, typesHeaders, { verbose });
  const schemas = contentTypesRaw.map(toSchema);
  if (verbose) console.log(`  Found ${schemas.length} content type(s)`);

  // ── Optionally fetch entries ───────────────────────────────
  let documents: Document[] | null = null;
  if (includeEntries) {
    if (verbose) console.log('\nFetching entries...');
    const entryQuery = contentType
      ? `${envUrl}/entries?locale=*&content_type=${encodeURIComponent(contentType)}`
      : `${envUrl}/entries?locale=*`;
    const entriesRaw = await fetchAll(
      entryQuery,
      headers,
      {
        verbose,
        usePreview,
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

  // ── Optionally fetch assets ────────────────────────────────
  let assets: PulledAsset[] | null = null;
  if (includeAssets) {
    if (verbose) console.log('\nFetching assets...');
    const assetsRaw = await fetchAll(
      `${envUrl}/assets?locale=*`,
      headers,
      {
        verbose,
        usePreview,
        onProgress: (fetched, total) => {
          if (!verbose) process.stdout.write(`\r  Fetching assets... ${fetched}/${total}`);
        },
      },
    );
    if (!verbose) process.stdout.write('\n');

    assets = [];
    for (const asset of assetsRaw) {
      const fileField = asset.fields?.file;
      if (!fileField) continue;
      for (const [locale, fileInfo] of Object.entries(fileField)) {
        const f = fileInfo as Record<string, any>;
        if (!f?.url) continue;
        assets.push({
          id: asset.sys.id,
          title: asset.fields?.title?.[locale] || asset.sys.id,
          fileName: f.fileName || 'unknown',
          contentType: f.contentType || 'application/octet-stream',
          url: f.url.startsWith('//') ? `https:${f.url}` : f.url,
          size: f.details?.size || 0,
          locale,
        });
      }
    }
    if (verbose) console.log(`  Found ${assets.length} asset file(s) across ${locales.length} locale(s)`);
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

    // Write asset metadata and download files
    if (assets && assets.length > 0) {
      const assetsDir = join(outputDir, 'assets');
      mkdirSync(assetsDir, { recursive: true });

      // Write metadata index
      writeFileSync(
        join(assetsDir, 'assets.json'),
        JSON.stringify(assets, null, 2) + '\n',
        'utf-8',
      );

      // Download asset files
      if (verbose) console.log('\nDownloading asset files...');
      const seen = new Set<string>();
      let downloaded = 0;
      let skipped = 0;
      for (const asset of assets) {
        // Deduplicate by URL (same file across locales)
        if (seen.has(asset.url)) { skipped++; continue; }
        seen.add(asset.url);

        // Sanitize filename
        const safeName = `${asset.id}_${asset.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        try {
          const res = await fetch(asset.url);
          if (!res.ok) {
            if (verbose) console.log(`  ⚠ Failed to download ${asset.fileName}: HTTP ${res.status}`);
            continue;
          }
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync(join(assetsDir, safeName), buffer);
          downloaded++;
          if (!verbose) process.stdout.write(`\r  Downloading assets... ${downloaded}`);
        } catch (err: any) {
          if (verbose) console.log(`  ⚠ Failed to download ${asset.fileName}: ${err.message}`);
        }
      }
      if (!verbose && downloaded > 0) process.stdout.write('\n');
      if (verbose) console.log(`  Downloaded ${downloaded} file(s)${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}`);
    }
  }

  return { schemas, locales, defaultLocale, documents, assets };
}
