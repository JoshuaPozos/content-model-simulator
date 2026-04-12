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

/**
 * Read documents from a source. Auto-detects format if not specified.
 * @param {string} inputPath - Path to NDJSON file, JSON file, or directory
 * @param {object} [options]
 * @param {'ndjson'|'json-array'|'json-dir'|'auto'} [options.format='auto']
 * @param {function} [options.transform] - Optional transform function applied to each raw document
 * @returns {Promise<Array<object>>} Array of normalized documents
 */
export async function readDocuments(inputPath, options = {}) {
  const { format = 'auto', transform } = options;
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input path does not exist: ${resolvedPath}`);
  }

  const detectedFormat = format === 'auto' ? detectFormat(resolvedPath) : format;

  let documents;
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

/**
 * Read all documents synchronously (for in-memory operations).
 * @param {string} inputPath
 * @param {object} [options]
 * @returns {Array<object>}
 */
export function readDocumentsSync(inputPath, options = {}) {
  const { format = 'auto', transform } = options;
  const resolvedPath = path.resolve(inputPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Input path does not exist: ${resolvedPath}`);
  }

  const detectedFormat = format === 'auto' ? detectFormat(resolvedPath) : format;

  let documents;
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

/**
 * Filter documents by content type
 */
export function filterByContentType(documents, contentType) {
  return documents.filter(d => d.contentType === contentType);
}

/**
 * Filter documents by locale
 */
export function filterByLocale(documents, locale) {
  return documents.filter(d => d.locale === locale);
}

/**
 * Filter documents by path pattern (regex)
 */
export function filterByPath(documents, pattern) {
  const regex = new RegExp(pattern);
  return documents.filter(d => d.path && regex.test(d.path));
}

/**
 * Get document statistics
 */
export function getDocumentStats(documents) {
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

function detectFormat(filePath) {
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

async function readNDJSON(filePath) {
  const documents = [];
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

function readNDJSONSync(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const documents = [];
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

function readJSONArray(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array in ${filePath}, got ${typeof parsed}`);
  }
  return parsed;
}

function readJSONDirectory(dirPath) {
  const documents = [];
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
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
