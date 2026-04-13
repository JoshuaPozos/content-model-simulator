/**
 * Content Model Simulator — Sanity NDJSON Reader
 *
 * Zero-dependency parser for Sanity dataset export files (NDJSON).
 * Extracts documents as simulator Document objects, filtering system
 * types and normalizing Sanity-specific structures (Portable Text,
 * localeString, slug, image references).
 *
 * Sanity exports use newline-delimited JSON where each line is a
 * document with `_id`, `_type`, `_createdAt`, `_updatedAt`, `_rev`.
 *
 * Draft documents have `_id` prefixed with `drafts.`.
 * System types (`system.*`) are filtered out by default.
 * Image assets (`sanity.imageAsset`) are collected separately.
 */

import fs from 'fs';
import path from 'path';
import type { Document } from '../types.js';

// ── Types ────────────────────────────────────────────────────────

export interface SanityReadOptions {
  /** Include draft documents (those with `_id` starting with `drafts.`). Defaults to false. */
  includeDrafts?: boolean;
  /** Include system types (`system.*`). Defaults to false. */
  includeSystemTypes?: boolean;
  /** Include `sanity.imageAsset` documents as regular documents. Defaults to false. */
  includeAssets?: boolean;
}

export interface SanityImageAsset {
  id: string;
  url: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  path: string;
  metadata?: Record<string, unknown>;
}

export interface SanityResult {
  documents: Document[];
  assets: SanityImageAsset[];
}

// ── Internal Sanity field types ──────────────────────────────────

/** Fields to strip from the data payload (Sanity system fields). */
const SYSTEM_FIELDS = new Set([
  '_id', '_type', '_createdAt', '_updatedAt', '_rev', '_key',
]);

/** Type prefixes that are filtered out by default. */
const SYSTEM_TYPE_PREFIXES = ['system.'];

/** Asset type name. */
const IMAGE_ASSET_TYPE = 'sanity.imageAsset';

// ── Public API ───────────────────────────────────────────────────

/**
 * Parse a Sanity NDJSON export file into simulator Documents.
 *
 * Produces documents with `contentType` set to the Sanity `_type`,
 * `id` from `_id` (with `drafts.` prefix stripped), and all content
 * fields in `data`.
 *
 * Sanity-specific structures are normalized:
 * - `{_type: "slug", current: "..."}` → the string value
 * - `{_type: "localeString", en: "...", es: "..."}` → kept as-is for locale-aware transforms
 * - Portable Text blocks → converted to HTML
 * - `{_ref: "...", _type: "reference"}` → kept as-is for transforms to resolve
 *
 * Image assets (`sanity.imageAsset`) are excluded from documents by default
 * but collected in the `SanityResult.assets` array.
 *
 * @example
 * ```ts
 * import { readSanity } from 'content-model-simulator';
 *
 * const documents = readSanity('production.ndjson');
 * // → [{ contentType: 'post', id: '...', data: { title, slug, body, ... } }, ...]
 * ```
 */
export function readSanity(filePath: string, options: SanityReadOptions = {}): Document[] {
  return parseSanity(filePath, options).documents;
}

/**
 * Parse Sanity NDJSON file and return both documents and image assets.
 */
export function parseSanity(filePath: string, options: SanityReadOptions = {}): SanityResult {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Sanity NDJSON file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, 'utf-8');
  return parseSanityString(content, options);
}

/**
 * Parse a Sanity NDJSON string directly (useful for testing without file I/O).
 */
export function parseSanityString(ndjson: string, options: SanityReadOptions = {}): SanityResult {
  const { includeDrafts = false, includeSystemTypes = false, includeAssets = false } = options;

  const documents: Document[] = [];
  const assets: SanityImageAsset[] = [];

  for (const line of ndjson.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue; // Skip malformed lines
    }

    const sanityType = raw._type as string | undefined;
    const sanityId = raw._id as string | undefined;
    if (!sanityType || !sanityId) continue;

    // Filter drafts
    if (!includeDrafts && sanityId.startsWith('drafts.')) continue;

    // Filter system types
    if (!includeSystemTypes && SYSTEM_TYPE_PREFIXES.some(p => sanityType.startsWith(p))) continue;

    // Collect image assets separately
    if (sanityType === IMAGE_ASSET_TYPE) {
      assets.push(parseImageAsset(raw));
      if (!includeAssets) continue;
    }

    // Build the data payload (all fields minus system fields)
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (SYSTEM_FIELDS.has(key)) continue;
      data[key] = normalizeField(value);
    }

    // Extract slug for path
    const slugValue = extractSlug(raw);

    documents.push({
      id: stripDraftsPrefix(sanityId),
      contentType: sanityType,
      path: slugValue ? `/${slugValue}` : undefined,
      data,
    });
  }

  return { documents, assets };
}

// ── Field Normalization ──────────────────────────────────────────

/**
 * Recursively normalize Sanity field values to plain data.
 */
function normalizeField(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    // Check if this is an array of Portable Text blocks
    if (isPortableTextArray(value)) {
      return portableTextToHTML(value);
    }
    return value.map(normalizeField);
  }

  const obj = value as Record<string, unknown>;

  // Sanity slug → plain string
  if (obj._type === 'slug' && typeof obj.current === 'string') {
    return obj.current;
  }

  // Sanity image reference → keep as-is (transforms can resolve)
  if (obj._type === 'image' && obj.asset) {
    return obj;
  }

  // Sanity reference → keep as-is
  if (obj._type === 'reference' && obj._ref) {
    return obj;
  }

  // localeString → normalize each locale value
  if (obj._type === 'localeString') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === '_type') continue;
      result[key] = normalizeField(val);
    }
    return result;
  }

  // Generic object without _type that has locale keys (en/es pattern)
  // These are NOT normalized here — they stay as objects for transforms

  // Portable Text block → convert to HTML
  if (obj._type === 'block' && Array.isArray(obj.children)) {
    return portableTextToHTML([obj]);
  }

  // Recurse into generic objects
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === '_key') continue; // Strip internal keys
    result[key] = normalizeField(val);
  }
  return result;
}

// ── Slug Extraction ──────────────────────────────────────────────

function extractSlug(raw: Record<string, unknown>): string | null {
  // Direct slug field
  if (raw.slug && typeof raw.slug === 'object') {
    const slug = raw.slug as Record<string, unknown>;
    if (slug._type === 'slug' && typeof slug.current === 'string') {
      return slug.current;
    }
  }
  // Plain string slug
  if (typeof raw.slug === 'string') return raw.slug;
  return null;
}

// ── Image Asset Parser ───────────────────────────────────────────

function parseImageAsset(raw: Record<string, unknown>): SanityImageAsset {
  return {
    id: raw._id as string,
    url: (raw.url as string) || '',
    originalFilename: (raw.originalFilename as string) || '',
    mimeType: (raw.mimeType as string) || '',
    size: (raw.size as number) || 0,
    path: (raw.path as string) || '',
    metadata: raw.metadata as Record<string, unknown> | undefined,
  };
}

// ── Portable Text → HTML ─────────────────────────────────────────

interface PTBlock {
  _type: string;
  _key?: string;
  style?: string;
  listItem?: string;
  level?: number;
  children?: PTSpan[];
  markDefs?: PTMarkDef[];
}

interface PTSpan {
  _type: string;
  _key?: string;
  text?: string;
  marks?: string[];
}

interface PTMarkDef {
  _key: string;
  _type: string;
  href?: string;
  [key: string]: unknown;
}

function isPortableTextArray(arr: unknown[]): boolean {
  if (arr.length === 0) return false;
  const first = arr[0];
  if (typeof first !== 'object' || first === null) return false;
  const obj = first as Record<string, unknown>;
  return obj._type === 'block' && Array.isArray(obj.children);
}

/**
 * Convert an array of Portable Text blocks to HTML.
 *
 * Supports: paragraphs, headings (h1–h6), bullet/number lists,
 * bold, italic, underline, strikethrough, code, and links.
 */
export function portableTextToHTML(blocks: unknown[]): string {
  const parts: string[] = [];
  let currentListType: string | null = null;

  for (const block of blocks) {
    const b = block as PTBlock;
    if (b._type !== 'block') {
      // Non-block nodes (images, custom types) — skip
      continue;
    }

    // Close list if switching list type or leaving a list
    if (currentListType && (!b.listItem || b.listItem !== currentListType)) {
      parts.push(currentListType === 'bullet' ? '</ul>' : '</ol>');
      currentListType = null;
    }

    // Open list if entering one
    if (b.listItem && !currentListType) {
      currentListType = b.listItem;
      parts.push(b.listItem === 'bullet' ? '<ul>' : '<ol>');
    }

    const inner = renderSpans(b.children || [], b.markDefs || []);

    if (b.listItem) {
      parts.push(`<li>${inner}</li>`);
    } else {
      const tag = styleToTag(b.style);
      parts.push(`<${tag}>${inner}</${tag}>`);
    }
  }

  // Close any remaining open list
  if (currentListType) {
    parts.push(currentListType === 'bullet' ? '</ul>' : '</ol>');
  }

  return parts.join('\n');
}

function renderSpans(children: PTSpan[], markDefs: PTMarkDef[]): string {
  const markDefMap = new Map(markDefs.map(d => [d._key, d]));

  return children.map(span => {
    if (span._type !== 'span') return '';

    let text = escapeHTML(span.text || '');
    const marks = span.marks || [];

    for (const mark of marks) {
      const def = markDefMap.get(mark);
      if (def) {
        // Annotation (link, etc.)
        if (def._type === 'link' && def.href) {
          text = `<a href="${escapeHTML(def.href)}">${text}</a>`;
        }
      } else {
        // Decorator
        switch (mark) {
          case 'strong':
            text = `<strong>${text}</strong>`;
            break;
          case 'em':
            text = `<em>${text}</em>`;
            break;
          case 'underline':
            text = `<u>${text}</u>`;
            break;
          case 'strike-through':
            text = `<s>${text}</s>`;
            break;
          case 'code':
            text = `<code>${text}</code>`;
            break;
        }
      }
    }

    return text;
  }).join('');
}

function styleToTag(style: string | undefined): string {
  switch (style) {
    case 'h1': return 'h1';
    case 'h2': return 'h2';
    case 'h3': return 'h3';
    case 'h4': return 'h4';
    case 'h5': return 'h5';
    case 'h6': return 'h6';
    case 'blockquote': return 'blockquote';
    default: return 'p';
  }
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Helpers ──────────────────────────────────────────────────────

function stripDraftsPrefix(id: string): string {
  return id.startsWith('drafts.') ? id.slice(7) : id;
}

/**
 * Detect whether an NDJSON file looks like a Sanity export.
 *
 * Peeks at the first non-empty line and checks for `_type` and `_id`
 * fields (present in all Sanity documents) without a `contentType`
 * field (which would indicate a simulator document).
 */
export function isSanityNDJSON(content: string): boolean {
  const firstLine = content.split('\n').find(l => l.trim());
  if (!firstLine) return false;
  try {
    const obj = JSON.parse(firstLine);
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj._type === 'string' &&
      typeof obj._id === 'string' &&
      !('contentType' in obj)
    );
  } catch {
    // If the first line is truncated (large document), use a regex heuristic:
    // Sanity docs always start with {"_createdAt":... or have "_type": and "_id":
    // near the beginning, and never have "contentType":
    const start = firstLine.slice(0, 500);
    return (
      start.startsWith('{') &&
      /"_type"\s*:/.test(start) &&
      /"_id"\s*:/.test(start) &&
      !/"contentType"\s*:/.test(start)
    );
  }
}
