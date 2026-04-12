/**
 * Content Model Simulator — Universal Data Reader
 *
 * Reads content documents from multiple formats:
 * - NDJSON (newline-delimited JSON)
 * - JSON array (single file with array of documents)
 * - JSON directory (one JSON file per document)
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
    default:
      throw new Error(`Unknown format: ${detectedFormat}`);
  }

  if (transform) {
    documents = documents.map(transform);
  }

  return documents;
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

function detectFormat(filePath: string): 'ndjson' | 'json-array' | 'json-dir' {
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) return 'json-dir';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ndjson' || ext === '.jsonl') return 'ndjson';
  // Peek at first non-empty character to distinguish JSON array from NDJSON
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024);
  fs.readSync(fd, buf, 0, 1024, 0);
  fs.closeSync(fd);
  const content = buf.toString('utf-8').trimStart();
  if (content.startsWith('[')) return 'json-array';
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

function readJSONArray(filePath: string): Document[] {
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
