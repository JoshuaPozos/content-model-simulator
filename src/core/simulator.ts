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
import type {
  SimulateConfig, SimulationReport, ReportIssue, Entry, EntryFields,
  ContentTypeDefinition, Document, SchemaLike, TransformerLike, TransformedEntry,
} from '../types.js';

export function simulate(config: SimulateConfig): SimulationReport {
  const {
    documents,
    schemas,
    transformers,
    assets: preSuppliedAssets,
    options = {},
  } = config;

  const {
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
      let specificEntryId = transformedEntry._metadata?.entryId ||
        generateEntryId(specificCtfType, `${name}-${doc.name || doc.id}-${locale}`);

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
            // Already locale-wrapped
            const hasLocaleKey = Object.keys(fieldValue).some(k =>
              k === baseLocale || report.locales.includes(k)
            );
            if (hasLocaleKey) {
              const actualValue = Object.values(fieldValue)[0];
              fields[fieldName] = { [baseLocale]: actualValue };
            } else {
              fields[fieldName] = { [baseLocale]: fieldValue };
            }
          } else {
            fields[fieldName] = { [baseLocale]: fieldValue };
          }
        }
      }

      // Link assets
      linkAssets(fields, urlToAssetId, baseLocale, { isAsset, getAssetUrl });

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
            if (report.contentTypes[fgEntry.contentType]) {
              report.contentTypes[fgEntry.contentType].entryCount++;
            }
            report.entries.push(fgEntry);
          }
        }
      }

      // Convert select fields using CT definition
      const ctDefForSelect = getSchema(specificCtfType);
      if (ctDefForSelect) {
        for (const f of ctDefForSelect.fields || []) {
          if (f.type === 'Symbol' && f.validations?.some(v => v.in)) {
            const val = fields[f.id]?.[baseLocale];
            if (val !== undefined) {
              fields[f.id] = { [baseLocale]: extractSelectKey(val) };
            }
          }
        }
      }

      // Validate
      const ctDef = getSchema(specificCtfType);
      if (ctDef) {
        const { errors, warnings } = validateEntry(
          { id: specificEntryId, contentType: specificCtfType, fields },
          ctDef,
          baseLocale
        );
        report.errors.push(...errors);
        report.warnings.push(...warnings);
      }

      // Track CT counts
      if (report.contentTypes[specificCtfType]) {
        report.contentTypes[specificCtfType].entryCount++;
      }

      const linkedEntryIds: string[] = [];
      const linkedAssetIds: string[] = [];
      for (const [, fw] of Object.entries(fields)) {
        const val = fw?.[baseLocale] as any;
        if (val?.sys?.linkType === 'Entry') linkedEntryIds.push(val.sys.id);
        if (val?.sys?.linkType === 'Asset') linkedAssetIds.push(val.sys.id);
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item?.sys?.linkType === 'Entry') linkedEntryIds.push(item.sys.id);
            if (item?.sys?.linkType === 'Asset') linkedAssetIds.push(item.sys.id);
            if (item && typeof item === 'object' && !(item as any).sys) {
              for (const subVal of Object.values(item as Record<string, any>)) {
                if (subVal?.sys?.linkType === 'Entry') linkedEntryIds.push(subVal.sys.id);
              }
            }
          }
        }
      }

      report.entries.push({
        id: specificEntryId,
        contentType: specificCtfType,
        locale,
        sourceId: doc.id || null,
        sourcePath: doc.path || null,
        sourceType: doc.contentType,
        fields,
        linkedEntryIds,
        linkedAssetIds,
      });
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
      entryId: generateEntryId(contentType, `${doc.id || doc.path || contentType}-${locale}`),
      sourceId: doc.id,
      sourcePath: doc.path || null,
      sourceType: contentType,
    },
    fields: {
      internalName: {
        [locale]: buildInternalName(doc, locale)
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

function buildInternalName(doc: Document, locale: string): string {
  const parts = doc.path?.split('/').filter(Boolean) || [];
  const component = parts[parts.length - 1] || doc.name || doc.contentType;
  return `${doc.contentType}-${component}-${locale}`.toLowerCase().substring(0, 200);
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

function await_import_transform() {
  return { transformGeneric: transformGenericEntry as (...args: any[]) => TransformedEntry };
}
