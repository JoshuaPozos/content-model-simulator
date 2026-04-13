/**
 * Content Model Simulator — Transformer System
 *
 * Provides a generic 1:1 field transformer and a registry for
 * custom transformers that users can provide.
 */

import { generateEntryId } from './helpers.js';
import type { Document, TransformedEntry, TransformFunction, TransformOptions } from '../types.js';

export function transformGeneric(
  doc: Document,
  locale: string,
  options: TransformOptions = {},
): TransformedEntry {
  const { mapLocale, isImageObject } = options;
  const resolvedLocale = mapLocale ? mapLocale(doc.locale || '') || locale : locale;
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
        [resolvedLocale]: buildInternalName(doc)
      }
    }
  };

  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    if (fieldName === 'internalName') continue;
    entry.fields[fieldName] = {
      [resolvedLocale]: transformFieldValue(fieldValue, fieldName, isImageObject)
    };
  }

  return entry;
}

function buildInternalName(doc: Document): string {
  const parts = doc.path?.split('/').filter(Boolean) || [];
  const component = parts[parts.length - 1] || doc.name || doc.contentType;
  return `${doc.contentType}-${component}`.toLowerCase().substring(0, 200);
}

function transformFieldValue(value: unknown, fieldName: string, isImageObject?: (obj: unknown) => boolean): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value;

  // Image objects: check with custom detector or default pattern
  if (isImageObject) {
    if (isImageObject(value)) return value;
  } else if ((value as Record<string, any>).links?.resource?.href) {
    return value;
  }

  // HTML content objects: { value: "<p>...</p>" }
  if ((value as Record<string, any>).value !== undefined && typeof (value as Record<string, any>).value === 'string') {
    return (value as Record<string, any>).value;
  }

  // Select/enum objects (small key-value pairs)
  if (Object.keys(value as object).length <= 5 &&
      Object.values(value as object).every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
    return value;
  }

  // All other objects pass through as JSON
  return value;
}

export class TransformerRegistry {
  #transformers = new Map<string, TransformFunction | null>();
  #typeMap = new Map<string, string | null>();

  register(sourceType: string, transformer: TransformFunction, targetType?: string): void {
    this.#transformers.set(sourceType, transformer);
    this.#typeMap.set(sourceType, targetType || sourceType);
  }

  skip(types: string[]): void {
    for (const t of types) {
      this.#transformers.set(t, null);
      this.#typeMap.set(t, null);
    }
  }

  get(contentType: string): TransformFunction | null {
    if (this.#transformers.has(contentType)) {
      return this.#transformers.get(contentType) ?? null;
    }
    return transformGeneric;
  }

  getTargetType(sourceType: string): string | null {
    if (this.#typeMap.has(sourceType)) {
      return this.#typeMap.get(sourceType) ?? null;
    }
    return sourceType;
  }

  isSkipped(contentType: string): boolean {
    return this.#transformers.has(contentType) && this.#transformers.get(contentType) === null;
  }
}
