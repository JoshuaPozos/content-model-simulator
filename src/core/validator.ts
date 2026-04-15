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

  // Check field-level validations (in, regexp, size, range, unique, dateRange)
  for (const fieldDef of (ctDef.fields || [])) {
    if (!fieldDef.validations?.length) continue;
    const wrapper = entry.fields[fieldDef.id];
    if (!wrapper) continue;
    const val = wrapper[baseLocale];
    if (val === null || val === undefined) continue;

    for (const v of fieldDef.validations) {
      // Allowed values
      if (v.in && Array.isArray(v.in)) {
        if (!v.in.includes(val as string)) {
          warnings.push({
            type: 'VALIDATION_IN',
            contentType: entry.contentType,
            field: fieldDef.id,
            entryId: entry.id,
            message: `Value "${String(val)}" is not in allowed values [${v.in.join(', ')}]`,
          });
        }
      }

      // Regex pattern
      const regexp = v.regexp as { pattern: string; flags?: string } | undefined;
      if (regexp?.pattern) {
        try {
          const re = new RegExp(regexp.pattern, regexp.flags || '');
          if (typeof val === 'string' && !re.test(val)) {
            warnings.push({
              type: 'VALIDATION_REGEXP',
              contentType: entry.contentType,
              field: fieldDef.id,
              entryId: entry.id,
              message: `Value "${val}" does not match pattern /${regexp.pattern}/${regexp.flags || ''}`,
            });
          }
        } catch { /* skip invalid regex from CMS */ }
      }

      // Size (string length or array length)
      const size = v.size as { min?: number; max?: number } | undefined;
      if (size) {
        const len = typeof val === 'string' ? val.length : Array.isArray(val) ? val.length : null;
        if (len !== null) {
          if (size.min !== undefined && len < size.min) {
            warnings.push({
              type: 'VALIDATION_SIZE',
              contentType: entry.contentType,
              field: fieldDef.id,
              entryId: entry.id,
              message: `Length ${len} is below minimum ${size.min}`,
            });
          }
          if (size.max !== undefined && len > size.max) {
            warnings.push({
              type: 'VALIDATION_SIZE',
              contentType: entry.contentType,
              field: fieldDef.id,
              entryId: entry.id,
              message: `Length ${len} exceeds maximum ${size.max}`,
            });
          }
        }
      }

      // Range (numeric min/max)
      const range = v.range as { min?: number; max?: number } | undefined;
      if (range && typeof val === 'number') {
        if (range.min !== undefined && val < range.min) {
          warnings.push({
            type: 'VALIDATION_RANGE',
            contentType: entry.contentType,
            field: fieldDef.id,
            entryId: entry.id,
            message: `Value ${val} is below minimum ${range.min}`,
          });
        }
        if (range.max !== undefined && val > range.max) {
          warnings.push({
            type: 'VALIDATION_RANGE',
            contentType: entry.contentType,
            field: fieldDef.id,
            entryId: entry.id,
            message: `Value ${val} exceeds maximum ${range.max}`,
          });
        }
      }

      // Unique (track for post-processing; here just flag the constraint)
      if (v.unique === true) {
        // Unique validation requires cross-entry comparison — handled in validateAll
      }

      // Date range
      const dateRange = v.dateRange as { min?: string; max?: string } | undefined;
      if (dateRange && typeof val === 'string') {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          if (dateRange.min && d < new Date(dateRange.min)) {
            warnings.push({
              type: 'VALIDATION_DATE_RANGE',
              contentType: entry.contentType,
              field: fieldDef.id,
              entryId: entry.id,
              message: `Date ${val} is before minimum ${dateRange.min}`,
            });
          }
          if (dateRange.max && d > new Date(dateRange.max)) {
            warnings.push({
              type: 'VALIDATION_DATE_RANGE',
              contentType: entry.contentType,
              field: fieldDef.id,
              entryId: entry.id,
              message: `Date ${val} is after maximum ${dateRange.max}`,
            });
          }
        }
      }
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

  // Cross-entry unique validation
  const uniqueTracker: Map<string, Map<unknown, string>> = new Map(); // "ct:field" → value → first entryId
  for (const entry of entries) {
    const ctDef = getSchema(entry.contentType);
    if (!ctDef?.fields) continue;
    for (const fieldDef of ctDef.fields) {
      if (!fieldDef.validations?.some(v => v.unique === true)) continue;
      const key = `${entry.contentType}:${fieldDef.id}`;
      if (!uniqueTracker.has(key)) uniqueTracker.set(key, new Map());
      const seen = uniqueTracker.get(key)!;
      const val = entry.fields[fieldDef.id]?.[baseLocale];
      if (val === null || val === undefined) continue;
      if (seen.has(val)) {
        allWarnings.push({
          type: 'VALIDATION_UNIQUE',
          contentType: entry.contentType,
          field: fieldDef.id,
          entryId: entry.id,
          message: `Duplicate value "${String(val)}" — also in entry "${seen.get(val)}"`,
        });
      } else {
        seen.set(val, entry.id);
      }
    }
  }

  return { errors: allErrors, warnings: allWarnings };
}
