/**
 * Content Model Simulator — Core Simulation Engine
 *
 * Runs the full simulation pipeline:
 *   1. Load source documents
 *   2. Detect needed content types
 *   3. Validate CT definitions exist
 *   4. Extract assets (images)
 *   5. Transform documents → entries
 *   6. Link assets
 *   7. Extract nested objects
 *   8. Convert select fields
 *   9. Validate fields against definitions
 *  10. Build report object
 *
 * No external API calls. Pure local processing.
 */

import { extractAssets, linkAssets } from '../extract/assets.js';
import { extractNestedObjects } from '../extract/nested-objects.js';
import { validateEntry } from './validator.js';
import { generateEntryId, extractSelectKey } from '../transform/helpers.js';
import { htmlToRichText, looksLikeHTML, isRichTextDocument } from '../transform/rich-text.js';
import type {
  SimulateConfig, SimulationReport, SimulateOptions, ReportIssue, Entry, EntryFields,
  ContentTypeDefinition, Document, SchemaLike, SchemaInput, TransformerLike, TransformedEntry,
} from '../types.js';

export function simulate(config: SimulateConfig): SimulationReport;
export function simulate(documents: Document[], schemas: SchemaInput, options?: SimulateOptions): SimulationReport;
export function simulate(
  configOrDocs: SimulateConfig | Document[],
  schemasArg?: SchemaInput,
  optionsArg?: SimulateOptions,
): SimulationReport {
  // Normalize: positional → config object
  const config: SimulateConfig = Array.isArray(configOrDocs)
    ? { documents: configOrDocs, schemas: schemasArg!, options: optionsArg }
    : configOrDocs;

  const {
    documents,
    schemas,
    transformers,
    assets: preSuppliedAssets,
    options = {},
  } = config;

  let {
    baseLocale = 'en',
    locales: explicitLocales,
    name = 'simulation',
    localeMap = {},
    fieldGroupMap = {},
    isAsset,
    getAssetUrl,
    verbose = false,
  } = options;

  // Resolve locale mapping function
  const effectiveLocaleMap = localeMap || {};
  const mapLocale = (sourceLocale?: string): string => {
    if (!sourceLocale) return baseLocale;
    return effectiveLocaleMap[sourceLocale] || sourceLocale;
  };

  // Schema access helpers
  const getSchema = typeof (schemas as SchemaLike).get === 'function'
    ? (schemas as SchemaLike).get!.bind(schemas)
    : (id: string) => (schemas as Record<string, ContentTypeDefinition>)[id];
  const getAllSchemas = typeof (schemas as SchemaLike).getAll === 'function'
    ? (schemas as SchemaLike).getAll!.bind(schemas)
    : () => schemas as Record<string, ContentTypeDefinition>;

  // Transformer access helpers
  const getTransformer = transformers
    ? (ct: string) => (transformers as TransformerLike).get(ct)
    : () => null;
  const getTargetType = transformers
    ? (ct: string) => (transformers as TransformerLike).getTargetType(ct)
    : (ct: string) => ct;
  const isSkipped = transformers
    ? (ct: string) => (transformers as TransformerLike).isSkipped(ct)
    : () => false;

  // ─── Initialize report ─────────────────────────────────────────────
  const report: SimulationReport = {
    page: name,
    timestamp: new Date().toISOString(),
    baseLocale,
    locales: explicitLocales || [],
    contentTypes: {},
    entries: [],
    assets: [],
    pageEntry: null,
    errors: [],
    warnings: [],
    stats: { totalEntries: 0, totalComponents: 0, totalAssets: 0, totalCTs: 0, totalLocales: 0, totalErrors: 0, totalWarnings: 0 },
  };

  // ─── Detect locales if not explicit ────────────────────────────────
  if (!explicitLocales) {
    const localeSet = new Set<string>();
    for (const doc of documents) {
      const locale = mapLocale(doc.locale);
      if (locale) localeSet.add(locale);
    }
    if (localeSet.size === 0) localeSet.add(baseLocale);
    report.locales = [...localeSet].sort();
  }

  // Auto-correct baseLocale when it doesn't match any detected locale
  // e.g. default 'en' when data has 'en-US'
  if (!report.locales.includes(report.baseLocale)) {
    const match = report.locales.find(l => l.startsWith(report.baseLocale + '-'))
      || report.locales.find(l => l.split('-')[0] === report.baseLocale.split('-')[0]);
    if (match) {
      report.baseLocale = match;
      baseLocale = match;
    }
  }

  // ─── Detect needed content types ───────────────────────────────────
  const neededCTs = new Set<string>();
  for (const doc of documents) {
    const targetType = getTargetType(doc.contentType);
    if (targetType && !isSkipped(doc.contentType)) {
      neededCTs.add(targetType);
    }
  }

  // ─── Register CT definitions in report ──────────────────────────────
  for (const ctId of neededCTs) {
    const def = getSchema(ctId);
    if (!def) {
      report.errors.push({
        type: 'MISSING_CT_DEFINITION',
        contentType: ctId,
        message: `No definition found for content type "${ctId}"`,
      });
      report.contentTypes[ctId] = { id: ctId, name: ctId, defined: false, entryCount: 0, fields: [] };
    } else {
      report.contentTypes[ctId] = {
        id: def.id,
        name: def.name,
        defined: true,
        entryCount: 0,
        displayField: def.displayField,
        fields: (def.fields || []).map(f => ({
          id: f.id,
          name: f.name,
          type: f.type,
          linkType: f.linkType || (f.items?.linkType) || null,
          required: f.required || false,
          localized: f.localized || false,
        })),
      };

      // Detect duplicate field IDs
      const seen = new Set<string>();
      for (const f of def.fields || []) {
        if (seen.has(f.id)) {
          report.warnings.push({
            type: 'DUPLICATE_FIELD',
            contentType: ctId,
            message: `Duplicate field "${f.id}" in content type "${ctId}"`,
          });
        }
        seen.add(f.id);
      }
    }
  }

  // ─── Extract assets ─────────────────────────────────────────────────
  const { assets, urlToAssetId } = extractAssets(documents, { isAsset, getAssetUrl });
  // Merge pre-supplied assets (e.g. from mock generator)
  if (preSuppliedAssets && preSuppliedAssets.length > 0) {
    const existingIds = new Set(assets.map(a => a.id));
    for (const a of preSuppliedAssets) {
      if (!existingIds.has(a.id)) {
        assets.push(a);
        existingIds.add(a.id);
      }
    }
  }
  report.assets = assets;

  // ─── Transform & process documents ──────────────────────────────────
  const { transformGeneric } = await_import_transform();

  // Intermediate per-locale entries before merging
  interface IntermediateEntry {
    id: string;
    contentType: string;
    locale: string;
    sourceId: string | null;
    sourcePath: string | null;
    sourceType: string;
    fields: EntryFields;
  }
  const intermediateEntries: IntermediateEntry[] = [];

  for (const doc of documents) {
    if (!doc.contentType) {
      report.warnings.push({
        type: 'MISSING_CONTENT_TYPE',
        path: doc.path || doc.id || '(unknown)',
        message: 'Document has no contentType and was skipped',
      });
      continue;
    }
    if (isSkipped(doc.contentType)) continue;

    const targetType = getTargetType(doc.contentType);
    if (!targetType) continue;

    const locale = mapLocale(doc.locale) || baseLocale;
    const transformer = getTransformer(doc.contentType);

    let transformed: TransformedEntry | TransformedEntry[];
    try {
      if (transformer) {
        transformed = transformer(doc, locale, { mapLocale, schemas: getAllSchemas() });
      } else {
        transformed = transformGenericEntry(doc, locale, mapLocale);
      }
    } catch (e) {
      report.errors.push({
        type: 'TRANSFORM_ERROR',
        contentType: doc.contentType,
        path: doc.path,
        message: (e as Error).message,
      });
      continue;
    }

    const transformedArray = Array.isArray(transformed) ? transformed : [transformed];

    for (const transformedEntry of transformedArray) {
      const specificCtfType = transformedEntry._metadata?.contentType || targetType;
      // Entry ID is locale-independent — same source produces same entry ID across locales
      let specificEntryId = transformedEntry._metadata?.entryId ||
        generateEntryId(specificCtfType, `${doc.path || doc.id || name}`);

      if (specificEntryId.length > 64) {
        report.warnings.push({
          type: 'ENTRY_ID_TRUNCATED',
          original: specificEntryId,
          truncated: specificEntryId.substring(0, 64),
        });
        specificEntryId = specificEntryId.substring(0, 64);
      }

      const fields: EntryFields = {};
      if (transformedEntry.fields) {
        for (const [fieldName, fieldValue] of Object.entries(transformedEntry.fields)) {
          if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
            // Already locale-wrapped: check if keys match known locales
            const fieldObj = fieldValue as Record<string, unknown>;
            const hasLocaleKey = Object.keys(fieldObj).some(k =>
              k === baseLocale || report.locales.includes(k)
            );
            if (hasLocaleKey) {
              // Preserve all locale keys from the wrapper
              const localeWrapper: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(fieldObj)) {
                if (k === baseLocale || report.locales.includes(k)) {
                  localeWrapper[k] = v;
                }
              }
              fields[fieldName] = localeWrapper;
            } else {
              fields[fieldName] = { [locale]: fieldValue };
            }
          } else {
            fields[fieldName] = { [locale]: fieldValue };
          }
        }
      }

      // Link assets
      linkAssets(fields, urlToAssetId, locale, { isAsset, getAssetUrl });

      // Extract nested objects
      if (fieldGroupMap && Object.keys(fieldGroupMap).length > 0) {
        const fgResult = extractNestedObjects(fields, specificCtfType, {
          locale,
          baseLocale,
          parentEntryId: specificEntryId,
          parentPath: doc.path || '',
          urlToAssetId,
          fieldGroupMap,
          schemas,
        });
        if (fgResult.entries.length > 0) {
          for (const fgEntry of fgResult.entries) {
            // Register CT in report
            if (!report.contentTypes[fgEntry.contentType]) {
              const fgDef = getSchema(fgEntry.contentType);
              if (fgDef) {
                report.contentTypes[fgEntry.contentType] = {
                  id: fgDef.id,
                  name: fgDef.name,
                  defined: true,
                  entryCount: 0,
                  displayField: fgDef.displayField,
                  fields: (fgDef.fields || []).map(f => ({
                    id: f.id, name: f.name, type: f.type,
                    linkType: f.linkType || null,
                    required: f.required || false,
                    localized: f.localized || false,
                  })),
                };
              }
            }
            // Push fg entries into the merge pipeline
            intermediateEntries.push({
              id: fgEntry.id,
              contentType: fgEntry.contentType,
              locale: fgEntry.locales[0] || locale,
              sourceId: null,
              sourcePath: fgEntry.sourcePath || null,
              sourceType: fgEntry.sourceType,
              fields: fgEntry.fields,
            });
          }
        }
      }

      // Convert select fields using CT definition
      const ctDefForSelect = getSchema(specificCtfType);
      if (ctDefForSelect) {
        for (const f of ctDefForSelect.fields || []) {
          if (f.type === 'Symbol' && f.validations?.some(v => v.in)) {
            const val = fields[f.id]?.[locale];
            if (val !== undefined) {
              fields[f.id] = { ...fields[f.id], [locale]: extractSelectKey(val) };
            }
          }
        }
      }

      // Auto-convert HTML strings → Rich Text for RichText fields
      const ctDefForRT = ctDefForSelect || getSchema(specificCtfType);
      if (ctDefForRT) {
        for (const f of ctDefForRT.fields || []) {
          if (f.type === 'RichText') {
            for (const loc of Object.keys(fields[f.id] || {})) {
              const val = fields[f.id]?.[loc];
              if (typeof val === 'string' && looksLikeHTML(val)) {
                fields[f.id][loc] = htmlToRichText(val);
                report.warnings.push({
                  type: 'HTML_TO_RICHTEXT_CONVERTED',
                  contentType: specificCtfType,
                  field: f.id,
                  entryId: specificEntryId,
                  message: `Auto-converted HTML string to Rich Text document`,
                });
              } else if (typeof val === 'string' && val.trim()) {
                // Plain text → wrap in Rich Text document
                fields[f.id][loc] = htmlToRichText(val);
              }
            }
          }
        }
      }

      intermediateEntries.push({
        id: specificEntryId,
        contentType: specificCtfType,
        locale,
        sourceId: doc.id || null,
        sourcePath: doc.path || null,
        sourceType: doc.contentType,
        fields,
      });
    }
  }

  // ─── Merge locale variants into single entries ──────────────────────
  // Group intermediate entries by a source key and merge their fields
  // so each final Entry contains all locales (like Contentful).
  {
    const mergeMap = new Map<string, Entry>();
    const mergeOrder: string[] = [];

    for (const ie of intermediateEntries) {
      const mergeKey = `${ie.contentType}::${ie.id}`;

      let merged = mergeMap.get(mergeKey);
      if (!merged) {
        merged = {
          id: ie.id,
          contentType: ie.contentType,
          locales: [],
          sourceId: ie.sourceId,
          sourcePath: ie.sourcePath,
          sourceType: ie.sourceType,
          fields: {},
          linkedEntryIds: [],
          linkedAssetIds: [],
        };
        mergeMap.set(mergeKey, merged);
        mergeOrder.push(mergeKey);
      }

      // Add locale
      if (!merged.locales.includes(ie.locale)) {
        merged.locales.push(ie.locale);
      }

      // Merge fields: add this locale's values into the merged entry
      for (const [fieldName, fieldWrapper] of Object.entries(ie.fields)) {
        if (!merged.fields[fieldName]) {
          merged.fields[fieldName] = {};
        }
        for (const [loc, val] of Object.entries(fieldWrapper)) {
          merged.fields[fieldName][loc] = val;
        }
      }
    }

    // Build final entries array in insertion order
    for (const key of mergeOrder) {
      const entry = mergeMap.get(key)!;

      // Compute linked entry/asset IDs from all locale values
      for (const [, fw] of Object.entries(entry.fields)) {
        for (const [, val] of Object.entries(fw)) {
          collectLinks(val, entry.linkedEntryIds, entry.linkedAssetIds);
        }
      }

      // Track CT counts
      if (report.contentTypes[entry.contentType]) {
        report.contentTypes[entry.contentType].entryCount++;
      }

      report.entries.push(entry);
    }
  }

  // ─── Validate entries ───────────────────────────────────────────────
  for (const entry of report.entries) {
    const ctDef = getSchema(entry.contentType);
    if (!ctDef) continue;

    // Validate for each locale present in the entry
    for (const locale of entry.locales) {
      const { errors, warnings } = validateEntry(
        { id: entry.id, contentType: entry.contentType, fields: entry.fields },
        ctDef,
        locale
      );
      report.errors.push(...errors);
      report.warnings.push(...warnings);
    }
  }

  // ─── Locale inheritance ──────────────────────────────────────────
  // For fields marked localized: false in the schema, copy the base locale
  // value to all other locales within the same entry.  This mirrors
  // Contentful's behavior where non-localized fields are shared.
  if (report.locales.length > 1) {
    for (const entry of report.entries) {
      if (!entry.locales.includes(baseLocale)) {
        report.warnings.push({
          type: 'MISSING_BASE_LOCALE_ENTRY',
          contentType: entry.contentType,
          entryId: entry.id,
          message: `Entry has no data for base locale '${baseLocale}' — non-localized fields cannot be inherited`,
        });
        continue;
      }

      const ctDef = getSchema(entry.contentType);
      if (!ctDef) continue;

      for (const fieldDef of ctDef.fields) {
        if (fieldDef.localized) continue; // only inherit non-localized
        const baseValue = entry.fields[fieldDef.id]?.[baseLocale];
        if (baseValue !== undefined) {
          for (const loc of entry.locales) {
            if (loc === baseLocale) continue;
            if (!entry.fields[fieldDef.id]) {
              entry.fields[fieldDef.id] = {};
            }
            entry.fields[fieldDef.id][loc] = baseValue;
          }
        }
      }
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────
  report.stats = {
    totalEntries: report.entries.length,
    totalComponents: report.entries.length,
    totalAssets: report.assets.length,
    totalCTs: Object.keys(report.contentTypes).length,
    totalLocales: report.locales.length,
    totalErrors: report.errors.length,
    totalWarnings: report.warnings.length,
  };

  return report;
}

// ─── Internal helpers ─────────────────────────────────────────────

function transformGenericEntry(doc: Document, locale: string, mapLocale: (l?: string) => string): TransformedEntry {
  const fields = doc.fields || doc.data || {};
  const contentType = doc.contentType;

  const entry: TransformedEntry = {
    _metadata: {
      contentType,
      entryId: generateEntryId(contentType, `${doc.path || doc.id || contentType}`),
      sourceId: doc.id,
      sourcePath: doc.path || null,
      sourceType: contentType,
    },
    fields: {
      internalName: {
        [locale]: buildInternalName(doc)
      }
    }
  };

  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    if (fieldName === 'internalName') continue;
    entry.fields[fieldName] = {
      [locale]: transformFieldValue(fieldValue)
    };
  }

  return entry;
}

function buildInternalName(doc: Document): string {
  const parts = doc.path?.split('/').filter(Boolean) || [];
  const component = parts[parts.length - 1] || doc.name || doc.contentType;
  return `${doc.contentType}-${component}`.toLowerCase().substring(0, 200);
}

function transformFieldValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value;
  if ((value as Record<string, any>).links?.resource?.href) return value;
  if ((value as Record<string, any>).value !== undefined && typeof (value as Record<string, any>).value === 'string') return (value as Record<string, any>).value;
  if (Object.keys(value as object).length <= 5 &&
      Object.values(value as object).every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
    return value;
  }
  return value;
}

function collectLinks(
  val: unknown,
  linkedEntryIds: string[],
  linkedAssetIds: string[],
): void {
  if (!val || typeof val !== 'object') return;
  const v = val as any;
  if (v.sys?.linkType === 'Entry') { linkedEntryIds.push(v.sys.id); return; }
  if (v.sys?.linkType === 'Asset') { linkedAssetIds.push(v.sys.id); return; }
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item?.sys?.linkType === 'Entry') linkedEntryIds.push(item.sys.id);
      else if (item?.sys?.linkType === 'Asset') linkedAssetIds.push(item.sys.id);
      else if (item && typeof item === 'object' && !item.sys) {
        for (const subVal of Object.values(item as Record<string, any>)) {
          if (subVal?.sys?.linkType === 'Entry') linkedEntryIds.push(subVal.sys.id);
          else if (subVal?.sys?.linkType === 'Asset') linkedAssetIds.push(subVal.sys.id);
        }
      }
    }
  }
}

function await_import_transform() {
  return { transformGeneric: transformGenericEntry as (...args: any[]) => TransformedEntry };
}
