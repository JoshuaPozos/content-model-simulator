/**
 * Content Model Simulator — Validation Engine
 *
 * Validates entry fields against content type definitions.
 * Produces errors and warnings without calling any external API.
 */

import type { Entry, ContentTypeDefinition, ReportIssue, SchemaLike, SchemaInput } from '../types.js';

export function validateEntry(
  entry: Pick<Entry, 'id' | 'contentType' | 'fields'>,
  ctDef: ContentTypeDefinition | null | undefined,
  baseLocale: string,
): { errors: ReportIssue[]; warnings: ReportIssue[] } {
  const errors: ReportIssue[] = [];
  const warnings: ReportIssue[] = [];

  if (!ctDef) {
    errors.push({
      type: 'MISSING_CT_DEFINITION',
      contentType: entry.contentType,
      entryId: entry.id,
      message: `No definition found for content type "${entry.contentType}"`,
    });
    return { errors, warnings };
  }

  const validFieldIds = new Set(ctDef.fields?.map(f => f.id) || []);

  // Check for unknown fields
  for (const fieldName of Object.keys(entry.fields)) {
    if (fieldName === 'locale' || fieldName === 'internalName') continue; // infrastructure fields
    if (!validFieldIds.has(fieldName)) {
      warnings.push({
        type: 'FIELD_NOT_IN_DEFINITION',
        contentType: entry.contentType,
        field: fieldName,
        entryId: entry.id,
      });
    }
  }

  // Check required fields
  for (const fieldDef of (ctDef.fields || [])) {
    if (fieldDef.required && !entry.fields[fieldDef.id]) {
      warnings.push({
        type: 'REQUIRED_FIELD_MISSING',
        contentType: entry.contentType,
        field: fieldDef.id,
        entryId: entry.id,
      });
    }
  }

  // Check Link:Asset fields have proper links
  for (const fieldDef of (ctDef.fields || [])) {
    if (fieldDef.type === 'Link' && fieldDef.linkType === 'Asset' && entry.fields[fieldDef.id]) {
      const val = entry.fields[fieldDef.id]?.[baseLocale] as Record<string, any> | undefined;
      if (val && (val as any).sys?.linkType !== 'Asset' && typeof val === 'object' && !(val as any).sys) {
        warnings.push({
          type: 'ASSET_FIELD_NOT_LINKED',
          contentType: entry.contentType,
          field: fieldDef.id,
          entryId: entry.id,
          message: 'Expected Asset link but got raw object',
        });
      }
    }
  }

  // Check null fields
  for (const [fieldName, fieldWrapper] of Object.entries(entry.fields)) {
    if (fieldWrapper?.[baseLocale] === null || fieldWrapper?.[baseLocale] === undefined) {
      warnings.push({
        type: 'NULL_FIELD',
        contentType: entry.contentType,
        field: fieldName,
        entryId: entry.id,
      });
    }
  }

  // Check entry ID length
  if (entry.id && entry.id.length > 64) {
    warnings.push({
      type: 'ENTRY_ID_TRUNCATED',
      entryId: entry.id,
      message: `Entry ID exceeds 64 characters (${entry.id.length})`,
    });
  }

  return { errors, warnings };
}

export function validateAll(
  entries: Array<Pick<Entry, 'id' | 'contentType' | 'fields'>>,
  schemas: SchemaInput,
  baseLocale: string,
): { errors: ReportIssue[]; warnings: ReportIssue[] } {
  const allErrors: ReportIssue[] = [];
  const allWarnings: ReportIssue[] = [];
  const getSchema = typeof (schemas as SchemaLike).get === 'function'
    ? (schemas as SchemaLike).get!.bind(schemas)
    : (id: string) => (schemas as Record<string, ContentTypeDefinition>)[id];

  for (const entry of entries) {
    const ctDef = getSchema(entry.contentType);
    const { errors, warnings } = validateEntry(entry, ctDef, baseLocale);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  return { errors: allErrors, warnings: allWarnings };
}
