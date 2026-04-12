/**
 * Content Model Simulator — Transformer System
 *
 * Provides a generic 1:1 field transformer and a registry for
 * custom transformers that users can provide.
 */

import { generateEntryId } from './helpers.js';

/**
 * Transform a source document to an entry using 1:1 field mapping.
 *
 * This generic transformer copies every field as-is, with special handling for:
 * - Image objects (objects with nested URL references) → kept for asset linking
 * - HTML wrappers ({ value: "<p>..." }) → unwrapped to string
 * - null/undefined → null
 *
 * @param {object} doc - Source document with { id, contentType, fields, locale?, path?, name? }
 * @param {string} locale - Target locale code
 * @param {object} [options]
 * @param {function} [options.mapLocale] - Optional locale mapping function
 * @param {function} [options.isImageObject] - Custom image object detector
 * @returns {object} Transformed entry with { _metadata, fields }
 */
export function transformGeneric(doc, locale, options = {}) {
  const { mapLocale, isImageObject } = options;
  const resolvedLocale = mapLocale ? mapLocale(doc.locale) || locale : locale;
  const fields = doc.fields || doc.data || {};
  const contentType = doc.contentType;

  const entry = {
    _metadata: {
      contentType,
      entryId: generateEntryId(contentType, `${doc.id || doc.path || contentType}-${resolvedLocale}`),
      sourceId: doc.id,
      sourcePath: doc.path || null,
      sourceType: contentType,
    },
    fields: {
      internalName: {
        [resolvedLocale]: buildInternalName(doc, resolvedLocale)
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

/**
 * Build an internalName for management purposes.
 */
function buildInternalName(doc, locale) {
  const parts = doc.path?.split('/').filter(Boolean) || [];
  const component = parts[parts.length - 1] || doc.name || doc.contentType;
  return `${doc.contentType}-${component}-${locale}`.toLowerCase().substring(0, 200);
}

/**
 * Transform a field value, preserving structure as faithfully as possible.
 */
function transformFieldValue(value, fieldName, isImageObject) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value;

  // Image objects: check with custom detector or default pattern
  if (isImageObject) {
    if (isImageObject(value)) return value;
  } else if (value.links?.resource?.href) {
    return value;
  }

  // HTML content objects: { value: "<p>...</p>" }
  if (value.value !== undefined && typeof value.value === 'string') {
    return value.value;
  }

  // Select/enum objects (small key-value pairs)
  if (Object.keys(value).length <= 5 &&
      Object.values(value).every(v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
    return value;
  }

  // All other objects pass through as JSON
  return value;
}

/**
 * Transformer Registry — maps content types to transform functions.
 *
 * Custom transformers receive (doc, locale, options) and return
 * a single entry object or an array of entry objects.
 */
export class TransformerRegistry {
  #transformers = new Map();
  #typeMap = new Map(); // sourceType → targetType

  /**
   * Register a custom transformer for a content type.
   * @param {string} sourceType - Source content type
   * @param {function} transformer - Transform function (doc, locale, options) => entry | entry[]
   * @param {string} [targetType] - Target content type id (defaults to sourceType)
   */
  register(sourceType, transformer, targetType) {
    this.#transformers.set(sourceType, transformer);
    this.#typeMap.set(sourceType, targetType || sourceType);
  }

  /**
   * Register content types that should be skipped (layout wrappers, etc.)
   * @param {string[]} types
   */
  skip(types) {
    for (const t of types) {
      this.#transformers.set(t, null);
      this.#typeMap.set(t, null);
    }
  }

  /**
   * Get the transformer for a content type.
   * Returns the generic transformer if no custom one is registered.
   * Returns null if the type should be skipped.
   * @param {string} contentType
   * @returns {function|null}
   */
  get(contentType) {
    if (this.#transformers.has(contentType)) {
      return this.#transformers.get(contentType);
    }
    return transformGeneric;
  }

  /**
   * Get the target content type for a source type.
   * @param {string} sourceType
   * @returns {string|null}
   */
  getTargetType(sourceType) {
    if (this.#typeMap.has(sourceType)) {
      return this.#typeMap.get(sourceType);
    }
    return sourceType;
  }

  /**
   * Check if a type should be skipped.
   * @param {string} contentType
   * @returns {boolean}
   */
  isSkipped(contentType) {
    return this.#transformers.has(contentType) && this.#transformers.get(contentType) === null;
  }
}
