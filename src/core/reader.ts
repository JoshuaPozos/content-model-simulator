/**
 * Content Model Simulator — Universal Data Reader
 *
 * Reads content documents from multiple formats:
 * - NDJSON (newline-delimited JSON)
 * - JSON array (single file with array of documents)
 * - JSON directory (one JSON file per document)
 * - WXR (WordPress eXtended RSS XML export)
 *
 * Expected document shape (normalized):
 * {
 *   id: string,
 *   contentType: string,
 *   fields: { [fieldId]: any },
 *   locale?: string,
 *   path?: string,
 *   name?: string
 * }
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { Document, ReadOptions } from '../types.js';
import { readWXR } from '../wordpress/wxr-reader.js';
import { readSanity, isSanityNDJSON } from '../sanity/sanity-reader.js';

export async function readDocuments(inputPath: string, options: ReadOptions = {}): Promise<Document[]> {
  const { format = 'auto', transform } = options;
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input path does not exist: ${resolvedPath}`);
  }

  const detectedFormat = format === 'auto' ? detectFormat(resolvedPath) : format;

  let documents: Document[];
  switch (detectedFormat) {
    case 'ndjson':
      documents = await readNDJSON(resolvedPath);
      break;
    case 'json-array':
      documents = readJSONArray(resolvedPath);
      break;
    case 'json-dir':
      documents = readJSONDirectory(resolvedPath);
      break;
    case 'wxr':
      documents = readWXR(resolvedPath);
      break;
    case 'sanity':
      documents = readSanity(resolvedPath);
      break;
    default:
      throw new Error(`Unknown format: ${detectedFormat}`);
  }

  if (transform) {
    documents = documents.map(transform);
  }

  return documents;
}

export function readDocumentsSync(inputPath: string, options: ReadOptions = {}): Document[] {
  const { format = 'auto', transform } = options;
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input path does not exist: ${resolvedPath}`);
  }

  const detectedFormat = format === 'auto' ? detectFormat(resolvedPath) : format;

  let documents: Document[];
  switch (detectedFormat) {
    case 'ndjson':
      documents = readNDJSONSync(resolvedPath);
      break;
    case 'json-array':
      documents = readJSONArray(resolvedPath);
      break;
    case 'json-dir':
      documents = readJSONDirectory(resolvedPath);
      break;
    case 'wxr':
      documents = readWXR(resolvedPath);
      break;
    case 'sanity':
      documents = readSanity(resolvedPath);
      break;
    default:
      throw new Error(`Unknown format: ${detectedFormat}`);
  }

  if (transform) {
    documents = documents.map(transform);
  }

  return documents;
}

/**
 * Streaming NDJSON reader — yields documents one at a time without
 * loading the entire file into memory. Suitable for files >100MB.
 * Only supports NDJSON format (not JSON array or directory).
 */
export async function* readDocumentsStream(
  inputPath: string,
  options: ReadOptions = {},
): AsyncGenerator<Document> {
  const { transform } = options;
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input path does not exist: ${resolvedPath}`);
  }

  const fileStream = fs.createReadStream(resolvedPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      let doc: Document = JSON.parse(trimmed);
      if (transform) doc = transform(doc);
      yield doc;
    } catch {
      // Skip malformed lines
    }
  }
}

export function filterByContentType(documents: Document[], contentType: string): Document[] {
  return documents.filter(d => d.contentType === contentType);
}

export function filterByLocale(documents: Document[], locale: string): Document[] {
  return documents.filter(d => d.locale === locale);
}

export function filterByPath(documents: Document[], pattern: string): Document[] {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    throw new Error(`Invalid filter pattern: ${pattern}`);
  }
  return documents.filter(d => d.path && regex.test(d.path));
}

export function getDocumentStats(documents: Document[]) {
  const contentTypes = new Set();
  const locales = new Set();
  for (const doc of documents) {
    if (doc.contentType) contentTypes.add(doc.contentType);
    if (doc.locale) locales.add(doc.locale);
  }
  return {
    totalDocuments: documents.length,
    contentTypes: [...contentTypes].sort(),
    locales: [...locales].sort(),
    contentTypeCount: contentTypes.size,
    localeCount: locales.size,
  };
}

// ─── Internal Readers ──────────────────────────────────────────────

function detectFormat(filePath: string): 'ndjson' | 'json-array' | 'json-dir' | 'wxr' | 'sanity' {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return 'json-dir';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xml') return 'wxr';
  // Peek at first bytes to distinguish formats (64KB covers most single-line NDJSON docs)
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(65536);
  const bytesRead = fs.readSync(fd, buf, 0, 65536, 0);
  fs.closeSync(fd);
  const content = buf.toString('utf-8', 0, bytesRead).trimStart();
  // Detect XML even without .xml extension
  if (content.startsWith('<?xml') || content.startsWith('<rss')) return 'wxr';
  if (content.startsWith('[')) return 'json-array';
  // Detect Sanity NDJSON (has _type and _id fields, no contentType)
  if (isSanityNDJSON(content)) return 'sanity';
  return 'ndjson';
}

async function readNDJSON(filePath: string): Promise<Document[]> {
  const documents: Document[] = [];
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      documents.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }

  return documents;
}

function readNDJSONSync(filePath: string): Document[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const documents: Document[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      documents.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines
    }
  }
  return documents;
}

const FILE_SIZE_WARNING_BYTES = 100 * 1024 * 1024; // 100 MB

function readJSONArray(filePath: string): Document[] {
  const size = fs.statSync(filePath).size;
  if (size > FILE_SIZE_WARNING_BYTES) {
    console.warn(
      `Warning: ${filePath} is ${(size / 1024 / 1024).toFixed(0)} MB. ` +
      `Consider converting to NDJSON for streaming reads.`
    );
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${filePath}, got ${typeof parsed}`);
  }
  return parsed;
}

function readJSONDirectory(dirPath: string): Document[] {
  const documents: Document[] = [];
  const files = fs.readdirSync(dirPath).filter((f: string) => f.endsWith('.json'));
  for (const file of files.sort()) {
    const filePath = path.join(dirPath, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        documents.push(...parsed);
      } else {
        documents.push(parsed);
      }
    } catch {
      // Skip malformed files
    }
  }
  return documents;
}
