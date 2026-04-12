/**
 * Content Model Simulator — Shared Helpers
 *
 * Utility functions used across the simulator.
 * Zero external dependencies.
 */

import type { LinkType, ContentLink, TerminalColors } from '../types.js';

export function generateEntryId(prefix: string, seed: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
  const hash = simpleHash(seed);
  const cleanSeed = seed.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 30);
  const id = `${cleanPrefix}_${cleanSeed}_${hash}`;
  return id.substring(0, 64);
}

export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function extractSelectKey(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && !Array.isArray(val) && !(val as Record<string, unknown>).sys) {
    const keys = Object.keys(val);
    if (keys.length >= 1) {
      const key = keys[0];
      if (key != null && key !== '') return key.trim();
    }
    return null;
  }
  return null;
}

export function isImageObject(obj: unknown): boolean {
  return !!(obj && typeof obj === 'object' && (obj as Record<string, any>).links?.resource?.href);
}

export function extractImageUrl(obj: unknown): string | null {
  return (obj as Record<string, any>)?.links?.resource?.href || null;
}

export function createLink(linkType: LinkType, id: string): ContentLink {
  return { sys: { type: 'Link', linkType, id } };
}

export function isLink(val: unknown, linkType?: LinkType): boolean {
  const v = val as Record<string, any>;
  if (v?.sys?.type !== 'Link') return false;
  if (linkType) return v.sys.linkType === linkType;
  return true;
}

export const c: TerminalColors = {
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
