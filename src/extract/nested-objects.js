/**
 * Content Model Simulator — Nested Object Extractor
 *
 * Definition-driven extraction of nested objects (FieldGroups)
 * from parent entries into standalone entries.
 *
 * Users provide a configuration map that tells the extractor:
 * - Which parent CT fields contain nested objects
 * - What content type each nested object maps to
 * - Whether it's a single object or array of objects
 */

import { generateEntryId, extractSelectKey, simpleHash } from '../transform/helpers.js';

/**
 * Extract nested objects from entry fields based on a configuration map.
 *
 * @param {object} fields - Entry fields { fieldName: { locale: value } }
 * @param {string} parentContentType
 * @param {object} options
 * @param {string} options.locale
 * @param {string} options.baseLocale
 * @param {string} options.parentEntryId
 * @param {string} options.parentPath
 * @param {Map<string, string>} options.urlToAssetId
 * @param {object} options.fieldGroupMap - { parentCT: { fieldId: { contentType, multiple } } }
 * @param {object} options.schemas - Schema registry or plain object of definitions
 * @returns {{ entries: Array<object>, stats: { extracted: number, fields: number } }}
 */
export function extractNestedObjects(fields, parentContentType, options) {
  const {
    locale,
    baseLocale,
    parentEntryId,
    parentPath = '',
    urlToAssetId = new Map(),
    fieldGroupMap = {},
    schemas = {},
  } = options;

  const entries = [];
  let extractedCount = 0;
  let fieldsProcessed = 0;

  const parentConfig = fieldGroupMap[parentContentType];
  if (!parentConfig) {
    return { entries, stats: { extracted: 0, fields: 0 } };
  }

  for (const [fieldId, config] of Object.entries(parentConfig)) {
    const fieldWrapper = fields[fieldId];
    const rawValue = fieldWrapper?.[baseLocale];
    if (rawValue == null) continue;

    fieldsProcessed++;
    const targetContentType = config.contentType;
    const isMultiple = config.multiple;
    const getSchema = typeof schemas.get === 'function' ? schemas.get.bind(schemas) : (id) => schemas[id];
    const ctDef = getSchema(targetContentType);

    if (isMultiple && Array.isArray(rawValue)) {
      const links = [];
      for (let i = 0; i < rawValue.length; i++) {
        const item = rawValue[i];
        if (!item || typeof item !== 'object' || item.sys) continue;
        const result = createNestedEntry(item, targetContentType, {
          index: i, locale, baseLocale, parentEntryId, parentPath,
          urlToAssetId, ctDef,
        });
        entries.push(result.entry);
        links.push({ sys: { type: 'Link', linkType: 'Entry', id: result.entry.id } });
        extractedCount++;
      }
      fields[fieldId] = { [baseLocale]: links };
    } else if (!isMultiple && typeof rawValue === 'object' && !Array.isArray(rawValue) && !rawValue.sys) {
      const result = createNestedEntry(rawValue, targetContentType, {
        index: 0, locale, baseLocale, parentEntryId, parentPath,
        urlToAssetId, ctDef,
      });
      entries.push(result.entry);
      fields[fieldId] = {
        [baseLocale]: { sys: { type: 'Link', linkType: 'Entry', id: result.entry.id } }
      };
      extractedCount++;
    }
  }

  return { entries, stats: { extracted: extractedCount, fields: fieldsProcessed } };
}

/**
 * Create a single entry from a nested object using its CT definition.
 */
function createNestedEntry(rawItem, contentType, options) {
  const { index, locale, baseLocale, parentEntryId, parentPath, urlToAssetId, ctDef } = options;

  const prefix = contentType.substring(0, 4);
  const suffix = `i${index}`;
  const parentClean = parentEntryId.replace(/[^a-zA-Z0-9]/g, '');
  const maxParent = 64 - prefix.length - 1 - suffix.length;
  const entryId = `${prefix}_${parentClean.substring(0, maxParent)}${suffix}`;

  const linkedAssetIds = [];
  const linkedEntryIds = [];
  const entryFields = {
    internalName: { [baseLocale]: `${contentType}-${index}-${locale}`.toLowerCase().substring(0, 200) }
  };

  if (ctDef?.fields) {
    for (const fieldDef of ctDef.fields) {
      if (fieldDef.id === 'internalName') continue;
      const rawVal = rawItem[fieldDef.id];
      if (rawVal === undefined) continue;

      if (fieldDef.type === 'Link' && fieldDef.linkType === 'Asset') {
        // Resolve image to asset link
        const url = rawVal?.links?.resource?.href;
        if (url && urlToAssetId.has(url)) {
          const assetId = urlToAssetId.get(url);
          entryFields[fieldDef.id] = { [baseLocale]: { sys: { type: 'Link', linkType: 'Asset', id: assetId } } };
          linkedAssetIds.push(assetId);
        } else {
          entryFields[fieldDef.id] = { [baseLocale]: rawVal };
        }
      } else if (fieldDef.type === 'Link' && fieldDef.linkType === 'Entry') {
        if (rawVal?.sys?.id) {
          entryFields[fieldDef.id] = { [baseLocale]: rawVal };
          linkedEntryIds.push(rawVal.sys.id);
        } else {
          entryFields[fieldDef.id] = { [baseLocale]: rawVal };
        }
      } else if (fieldDef.type === 'Symbol' && fieldDef.validations?.some(v => v.in)) {
        entryFields[fieldDef.id] = { [baseLocale]: extractSelectKey(rawVal) };
      } else if (fieldDef.type === 'Boolean') {
        entryFields[fieldDef.id] = { [baseLocale]: rawVal === true };
      } else if (fieldDef.type === 'Integer' || fieldDef.type === 'Number') {
        entryFields[fieldDef.id] = { [baseLocale]: typeof rawVal === 'number' ? rawVal : null };
      } else {
        entryFields[fieldDef.id] = { [baseLocale]: rawVal ?? null };
      }
    }
  } else {
    // No definition: copy all fields as-is
    for (const [key, val] of Object.entries(rawItem)) {
      entryFields[key] = { [baseLocale]: val ?? null };
    }
  }

  const entry = {
    id: entryId,
    contentType,
    locale,
    sourcePath: parentPath,
    sourceType: contentType,
    fields: entryFields,
    linkedEntryIds,
    linkedAssetIds,
  };

  return { entry, link: { sys: { type: 'Link', linkType: 'Entry', id: entryId } } };
}
