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
import type { ContentTypeDefinition, Entry, EntryFields, ExtractNestedOptions, ExtractNestedResult, SchemaLike, SchemaInput } from '../types.js';

export function extractNestedObjects(
  fields: EntryFields,
  parentContentType: string,
  options: ExtractNestedOptions,
): ExtractNestedResult {
  const {
    locale,
    baseLocale,
    parentEntryId,
    parentPath = '',
    urlToAssetId = new Map(),
    fieldGroupMap = {},
    schemas = {},
  } = options;

  const entries: Entry[] = [];
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
    const getSchema = typeof (schemas as SchemaLike).get === 'function'
      ? (schemas as SchemaLike).get!.bind(schemas)
      : (id: string) => (schemas as Record<string, ContentTypeDefinition>)[id];
    const ctDef = getSchema(targetContentType);

    if (isMultiple && Array.isArray(rawValue)) {
      const links = [];
      for (let i = 0; i < rawValue.length; i++) {
        const item = rawValue[i] as Record<string, unknown>;
        if (!item || typeof item !== 'object' || (item as any).sys) continue;
        const result = createNestedEntry(item, targetContentType, {
          index: i, locale, baseLocale, parentEntryId, parentPath,
          urlToAssetId, ctDef,
        });
        entries.push(result.entry);
        links.push({ sys: { type: 'Link', linkType: 'Entry', id: result.entry.id } });
        extractedCount++;
      }
      fields[fieldId] = { [baseLocale]: links };
    } else if (!isMultiple && typeof rawValue === 'object' && !Array.isArray(rawValue) && !(rawValue as any).sys) {
      const result = createNestedEntry(rawValue as Record<string, unknown>, targetContentType, {
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

function createNestedEntry(
  rawItem: Record<string, unknown>,
  contentType: string,
  options: {
    index: number;
    locale: string;
    baseLocale: string;
    parentEntryId: string;
    parentPath: string;
    urlToAssetId: Map<string, string>;
    ctDef: ContentTypeDefinition | null | undefined;
  },
): { entry: Entry; link: { sys: { type: 'Link'; linkType: 'Entry'; id: string } } } {
  const { index, locale, baseLocale, parentEntryId, parentPath, urlToAssetId, ctDef } = options;

  const prefix = contentType.substring(0, 4);
  const suffix = `i${index}`;
  const parentClean = parentEntryId.replace(/[^a-zA-Z0-9]/g, '');
  const maxParent = 64 - prefix.length - 1 - suffix.length;
  const entryId = `${prefix}_${parentClean.substring(0, maxParent)}${suffix}`;

  const linkedAssetIds: string[] = [];
  const linkedEntryIds: string[] = [];
  const entryFields: EntryFields = {
    internalName: { [baseLocale]: `${contentType}-${index}-${locale}`.toLowerCase().substring(0, 200) }
  };

  if (ctDef?.fields) {
    for (const fieldDef of ctDef.fields) {
      if (fieldDef.id === 'internalName') continue;
      const rawVal = rawItem[fieldDef.id];
      if (rawVal === undefined) continue;

      if (fieldDef.type === 'Link' && fieldDef.linkType === 'Asset') {
        // Resolve image to asset link
        const url = (rawVal as Record<string, any>)?.links?.resource?.href;
        if (url && urlToAssetId.has(url)) {
          const assetId = urlToAssetId.get(url)!;
          entryFields[fieldDef.id] = { [baseLocale]: { sys: { type: 'Link', linkType: 'Asset', id: assetId } } };
          linkedAssetIds.push(assetId);
        } else {
          entryFields[fieldDef.id] = { [baseLocale]: rawVal };
        }
      } else if (fieldDef.type === 'Link' && fieldDef.linkType === 'Entry') {
        if ((rawVal as any)?.sys?.id) {
          entryFields[fieldDef.id] = { [baseLocale]: rawVal };
          linkedEntryIds.push((rawVal as any).sys.id);
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

  const entry: Entry = {
    id: entryId,
    contentType,
    locales: [locale],
    sourceType: contentType,
    sourcePath: parentPath,
    fields: entryFields,
    linkedEntryIds,
    linkedAssetIds,
  };

  return { entry, link: { sys: { type: 'Link', linkType: 'Entry', id: entryId } } };
}
