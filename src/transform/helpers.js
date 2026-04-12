/**
 * Content Model Simulator — Shared Helpers
 *
 * Utility functions used across the simulator.
 * Zero external dependencies.
 */

/**
 * Generate a deterministic, URL-safe entry ID.
 * Follows the 64-character maximum constraint.
 *
 * @param {string} prefix - Content type or prefix
 * @param {string} seed - Unique seed string
 * @returns {string} Entry ID (max 64 chars)
 */
export function generateEntryId(prefix, seed) {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const hash = simpleHash(seed);
  const cleanSeed = seed.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30);
  const id = `${cleanPrefix}_${cleanSeed}_${hash}`;
  return id.substring(0, 64);
}

/**
 * Simple deterministic hash function (DJB2 variant).
 * @param {string} str
 * @returns {string} Hash string (base36)
 */
export function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract the key from a select/dropdown field value.
 * Handles { "key": "Label" } objects and plain strings.
 *
 * @param {*} val
 * @returns {string|null}
 */
export function extractSelectKey(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && !Array.isArray(val) && !val.sys) {
    const keys = Object.keys(val);
    if (keys.length >= 1) {
      const key = keys[0];
      if (key != null && key !== '') return key.trim();
    }
    return null;
  }
  return null;
}

/**
 * Detect if a value is an image/asset object.
 * Default detection checks for { links: { resource: { href: "..." } } }
 *
 * @param {*} obj
 * @returns {boolean}
 */
export function isImageObject(obj) {
  return !!(obj && typeof obj === 'object' && obj.links?.resource?.href);
}

/**
 * Extract the image URL from an image object.
 * @param {object} obj
 * @returns {string|null}
 */
export function extractImageUrl(obj) {
  return obj?.links?.resource?.href || null;
}

/**
 * Create a content link reference object.
 * @param {'Entry'|'Asset'} linkType
 * @param {string} id
 * @returns {object}
 */
export function createLink(linkType, id) {
  return { sys: { type: 'Link', linkType, id } };
}

/**
 * Check if a value is a content link reference.
 * @param {*} val
 * @param {'Entry'|'Asset'} [linkType] - Optional specific link type
 * @returns {boolean}
 */
export function isLink(val, linkType) {
  if (val?.sys?.type !== 'Link') return false;
  if (linkType) return val.sys.linkType === linkType;
  return true;
}

/**
 * Terminal colors for CLI output.
 */
export const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  underline: '\x1b[4m',
};
