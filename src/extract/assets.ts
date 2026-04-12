/**
 * Content Model Simulator — Asset Extractor
 *
 * Recursively walks document fields to discover image/asset objects
 * and builds a URL→AssetID map for linking.
 */

import { generateEntryId, simpleHash } from '../transform/helpers.js';
import type { Document, Asset, ExtractAssetsOptions, ExtractAssetsResult } from '../types.js';

export function extractAssets(documents: Document[], options: ExtractAssetsOptions = {}): ExtractAssetsResult {
  const {
    isAsset = defaultIsAsset,
    getAssetUrl = defaultGetAssetUrl,
  } = options;

  const imageUrlMap = new Map<string, { id: string; title: string; url: string; referencedBy: string[] }>();

  function walk(obj: unknown, docPath: string): void {
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
          imageUrlMap.get(url)!.referencedBy!.push(docPath);
        }
      }
      return;
    }

    for (const val of Object.values(obj as Record<string, unknown>)) {
      walk(val, docPath);
    }
  }

  for (const doc of documents) {
    walk(doc.fields, doc.path || doc.id || 'unknown');
  }

  const assets: Asset[] = [...imageUrlMap.values()].map(info => ({
    id: info.id,
    title: info.title,
    url: info.url,
    referencedBy: info.referencedBy,
  }));
  const urlToAssetId = new Map<string, string>();
  for (const [url, info] of imageUrlMap) {
    urlToAssetId.set(url, info.id);
  }

  return { assets, urlToAssetId };
}

export function linkAssets(
  fields: Record<string, Record<string, unknown>>,
  urlToAssetId: Map<string, string>,
  baseLocale: string,
  options: ExtractAssetsOptions = {},
): void {
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

function defaultIsAsset(obj: unknown): boolean {
  return !!(obj && typeof obj === 'object' && (obj as Record<string, any>).links?.resource?.href);
}

function defaultGetAssetUrl(obj: unknown): string | null {
  return (obj as Record<string, any>)?.links?.resource?.href || null;
}
