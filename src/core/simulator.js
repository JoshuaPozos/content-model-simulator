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

/**
 * Run the full simulation pipeline.
 *
 * @param {object} config
 * @param {Array<object>} config.documents - Source documents
 * @param {object} config.schemas - SchemaRegistry instance or plain object of CT definitions
 * @param {object} [config.transformers] - TransformerRegistry instance (optional)
 * @param {object} [config.options]
 * @param {string} [config.options.baseLocale='en'] - Base locale code
 * @param {string[]} [config.options.locales] - All locale codes
 * @param {string} [config.options.name='simulation'] - Simulation name
 * @param {object} [config.options.localeMap] - Source locale → target locale mapping
 * @param {object} [config.options.fieldGroupMap] - Nested object extraction config
 * @param {function} [config.options.isAsset] - Custom asset detection
 * @param {function} [config.options.getAssetUrl] - Custom asset URL extraction
 * @param {boolean} [config.options.verbose=false]
 * @returns {object} Report object
 */
export function simulate(config) {
  const {
    documents,
    schemas,
    transformers,
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
  const mapLocale = (sourceLocale) => {
    if (!sourceLocale) return baseLocale;
    return effectiveLocaleMap[sourceLocale] || sourceLocale;
  };

  // Schema access helpers
  const getSchema = typeof schemas.get === 'function' ? schemas.get.bind(schemas) : (id) => schemas[id];
  const getAllSchemas = typeof schemas.getAll === 'function' ? schemas.getAll.bind(schemas) : () => schemas;

  // Transformer access helpers
  const getTransformer = transformers
    ? (ct) => transformers.get(ct)
    : () => null; // no custom transformers — use generic
  const getTargetType = transformers
    ? (ct) => transformers.getTargetType(ct)
    : (ct) => ct;
  const isSkipped = transformers
    ? (ct) => transformers.isSkipped(ct)
    : () => false;

  // ─── Initialize report ─────────────────────────────────────────────
  const report = {
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
    stats: { totalEntries: 0, totalAssets: 0, totalCTs: 0 },
  };

  // ─── Detect locales if not explicit ────────────────────────────────
  if (!explicitLocales) {
    const localeSet = new Set();
    for (const doc of documents) {
      const locale = mapLocale(doc.locale);
      if (locale) localeSet.add(locale);
    }
    if (localeSet.size === 0) localeSet.add(baseLocale);
    report.locales = [...localeSet].sort();
  }

  // ─── Detect needed content types ───────────────────────────────────
  const neededCTs = new Set();
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
  report.assets = assets;

  // ─── Transform & process documents ──────────────────────────────────
  const { transformGeneric } = await_import_transform();

  for (const doc of documents) {
    if (isSkipped(doc.contentType)) continue;

    const targetType = getTargetType(doc.contentType);
    if (!targetType) continue;

    const locale = mapLocale(doc.locale) || baseLocale;
    const transformer = getTransformer(doc.contentType);

    let transformed;
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
        message: e.message,
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

      // Build fields
      const fields = {};
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

      // Find linked entries
      const linkedEntryIds = [];
      const linkedAssetIds = [];
      for (const [, fw] of Object.entries(fields)) {
        const val = fw?.[baseLocale];
        if (val?.sys?.linkType === 'Entry') linkedEntryIds.push(val.sys.id);
        if (val?.sys?.linkType === 'Asset') linkedAssetIds.push(val.sys.id);
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item?.sys?.linkType === 'Entry') linkedEntryIds.push(item.sys.id);
            if (item?.sys?.linkType === 'Asset') linkedAssetIds.push(item.sys.id);
            if (item && typeof item === 'object' && !item.sys) {
              for (const subVal of Object.values(item)) {
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

function transformGenericEntry(doc, locale, mapLocale) {
  const fields = doc.fields || doc.data || {};
  const contentType = doc.contentType;

  const entry = {
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

function buildInternalName(doc, locale) {
  const parts = doc.path?.split('/').filter(Boolean) || [];
  const component = parts[parts.length - 1] || doc.name || doc.contentType;
  return `${doc.contentType}-${component}-${locale}`.toLowerCase().substring(0, 200);
}

function transformFieldValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value;
  if (value.links?.resource?.href) return value;
  if (value.value !== undefined && typeof value.value === 'string') return value.value;
  if (Object.keys(value).length <= 5 &&
      Object.values(value).every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
    return value;
  }
  return value;
}

/**
 * Lazy import to avoid circular dependencies.
 * Returns the transformGeneric function.
 */
function await_import_transform() {
  return { transformGeneric: transformGenericEntry };
}
