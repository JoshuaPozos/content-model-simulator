/**
 * Content Model Simulator — Asset Extractor
 *
 * Recursively walks document fields to discover image/asset objects
 * and builds a URL→AssetID map for linking.
 */

import { generateEntryId, simpleHash } from '../transform/helpers.js';

/**
 * Extract all assets (images) from a collection of documents.
 *
 * @param {Array<object>} documents - Source documents with { fields, path? }
 * @param {object} [options]
 * @param {function} [options.isAsset] - Custom asset detection function (default: checks links.resource.href)
 * @param {function} [options.getAssetUrl] - Custom URL extraction (default: obj.links.resource.href)
 * @returns {{ assets: Array<object>, urlToAssetId: Map<string, string> }}
 */
export function extractAssets(documents, options = {}) {
  const {
    isAsset = defaultIsAsset,
    getAssetUrl = defaultGetAssetUrl,
  } = options;

  const imageUrlMap = new Map(); // url → { id, title, url, referencedBy }

  function walk(obj, docPath) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(item => walk(item, docPath));
      return;
    }

    if (isAsset(obj)) {
      const url = getAssetUrl(obj);
      if (url && url.startsWith('http')) {
        if (!imageUrlMap.has(url)) {
          const filename = url.split('/').pop()?.split('?')[0] || 'image';
          const urlHash = simpleHash(url);
          imageUrlMap.set(url, {
            id: `asset_${filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 40)}_${urlHash}`,
            title: filename,
            url,
            referencedBy: [docPath],
          });
        } else {
          imageUrlMap.get(url).referencedBy.push(docPath);
        }
      }
      return;
    }

    for (const val of Object.values(obj)) {
      walk(val, docPath);
    }
  }

  for (const doc of documents) {
    walk(doc.fields, doc.path || doc.id || 'unknown');
  }

  const assets = [...imageUrlMap.values()];
  const urlToAssetId = new Map();
  for (const [url, info] of imageUrlMap) {
    urlToAssetId.set(url, info.id);
  }

  return { assets, urlToAssetId };
}

/**
 * Link assets in entry fields — replace image objects with Asset link references.
 *
 * @param {object} fields - Entry fields { fieldName: { locale: value } }
 * @param {Map<string, string>} urlToAssetId - URL → Asset ID map
 * @param {string} baseLocale
 * @param {object} [options]
 * @param {function} [options.isAsset]
 * @param {function} [options.getAssetUrl]
 */
export function linkAssets(fields, urlToAssetId, baseLocale, options = {}) {
  const {
    isAsset = defaultIsAsset,
    getAssetUrl = defaultGetAssetUrl,
  } = options;

  for (const [fieldName, fieldWrapper] of Object.entries(fields)) {
    const fieldValue = fieldWrapper?.[baseLocale];
    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue) && isAsset(fieldValue)) {
      const url = getAssetUrl(fieldValue);
      if (url && urlToAssetId.has(url)) {
        fields[fieldName] = {
          [baseLocale]: { sys: { type: 'Link', linkType: 'Asset', id: urlToAssetId.get(url) } }
        };
      }
    }
  }
}

// ─── Default detectors ─────────────────────────────────────────────

function defaultIsAsset(obj) {
  return !!(obj && typeof obj === 'object' && obj.links?.resource?.href);
}

function defaultGetAssetUrl(obj) {
  return obj?.links?.resource?.href || null;
}
