import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readDocuments,
  readDocumentsSync,
  readDocumentsStream,
  filterByContentType,
  filterByLocale,
  filterByPath,
  getDocumentStats,
} from './reader.js';

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sim-reader-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const sampleDocs = [
  { id: '1', contentType: 'blogPost', locale: 'en', path: '/blog/hello', fields: { title: 'Hello' } },
  { id: '2', contentType: 'author', locale: 'en', path: '/authors/alice', fields: { name: 'Alice' } },
  { id: '3', contentType: 'blogPost', locale: 'es', path: '/blog/hola', fields: { title: 'Hola' } },
];

describe('readDocuments (async)', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it('reads NDJSON files', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.ndjson');
    const content = sampleDocs.map(d => JSON.stringify(d)).join('\n') + '\n';
    fs.writeFileSync(filePath, content);

    const docs = await readDocuments(filePath);
    assert.equal(docs.length, 3);
    assert.equal(docs[0].contentType, 'blogPost');
  });

  it('reads JSON array files', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify(sampleDocs));

    const docs = await readDocuments(filePath);
    assert.equal(docs.length, 3);
  });

  it('reads directories of JSON files', async () => {
    tmpDir = createTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'a.json'), JSON.stringify(sampleDocs[0]));
    fs.writeFileSync(path.join(tmpDir, 'b.json'), JSON.stringify(sampleDocs[1]));

    const docs = await readDocuments(tmpDir);
    assert.equal(docs.length, 2);
  });

  it('skips malformed NDJSON lines', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.ndjson');
    const content = JSON.stringify(sampleDocs[0]) + '\n{bad json}\n' + JSON.stringify(sampleDocs[1]) + '\n';
    fs.writeFileSync(filePath, content);

    const docs = await readDocuments(filePath);
    assert.equal(docs.length, 2);
  });

  it('skips blank lines in NDJSON', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.ndjson');
    const content = JSON.stringify(sampleDocs[0]) + '\n\n\n' + JSON.stringify(sampleDocs[1]) + '\n';
    fs.writeFileSync(filePath, content);

    const docs = await readDocuments(filePath);
    assert.equal(docs.length, 2);
  });

  it('throws on nonexistent path', async () => {
    await assert.rejects(
      () => readDocuments('/nonexistent/file.ndjson'),
      /does not exist/
    );
  });

  it('applies transform function', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.ndjson');
    fs.writeFileSync(filePath, JSON.stringify(sampleDocs[0]) + '\n');

    const docs = await readDocuments(filePath, {
      transform: (doc) => {
        const raw = doc as Record<string, unknown>;
        return { contentType: String(raw.contentType ?? ''), ...raw, transformed: true };
      },
    });
    assert.ok((docs[0] as unknown as Record<string, unknown>).transformed);
  });

  it('throws on non-array JSON', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify({ notArray: true }));

    await assert.rejects(
      () => readDocuments(filePath, { format: 'json-array' }),
      /Expected JSON array/
    );
  });

  it('reads .jsonl extension as NDJSON', async () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.jsonl');
    fs.writeFileSync(filePath, JSON.stringify(sampleDocs[0]) + '\n');

    const docs = await readDocuments(filePath);
    assert.equal(docs.length, 1);
  });
});

describe('readDocumentsSync', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanup(tmpDir);
  });

  it('reads NDJSON files synchronously', () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.ndjson');
    fs.writeFileSync(filePath, sampleDocs.map(d => JSON.stringify(d)).join('\n'));

    const docs = readDocumentsSync(filePath);
    assert.equal(docs.length, 3);
  });

  it('reads JSON arrays synchronously', () => {
    tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'data.json');
    fs.writeFileSync(filePath, JSON.stringify(sampleDocs));

    const docs = readDocumentsSync(filePath);
    assert.equal(docs.length, 3);
  });

  it('throws on nonexistent path', () => {
    assert.throws(
      () => readDocumentsSync('/nonexistent/file.json'),
      /does not exist/
    );
  });
});

describe('filterByContentType', () => {
  it('filters documents by content type', () => {
    const result = filterByContentType(sampleDocs, 'blogPost');
    assert.equal(result.length, 2);
    assert.ok(result.every(d => d.contentType === 'blogPost'));
  });

  it('returns empty array for no matches', () => {
    const result = filterByContentType(sampleDocs, 'nonexistent');
    assert.equal(result.length, 0);
  });
});

describe('filterByLocale', () => {
  it('filters documents by locale', () => {
    const result = filterByLocale(sampleDocs, 'en');
    assert.equal(result.length, 2);
    assert.ok(result.every(d => d.locale === 'en'));
  });

  it('returns empty array for no matches', () => {
    const result = filterByLocale(sampleDocs, 'fr');
    assert.equal(result.length, 0);
  });
});

describe('filterByPath', () => {
  it('filters by regex pattern', () => {
    const result = filterByPath(sampleDocs, '^/blog/');
    assert.equal(result.length, 2);
  });

  it('returns empty array for no matches', () => {
    const result = filterByPath(sampleDocs, '^/products/');
    assert.equal(result.length, 0);
  });

  it('skips documents without path', () => {
    const docs = [{ id: '1', contentType: 'x', fields: {} }];
    const result = filterByPath(docs, '.*');
    assert.equal(result.length, 0);
  });
});

describe('getDocumentStats', () => {
  it('returns correct stats', () => {
    const stats = getDocumentStats(sampleDocs);
    assert.equal(stats.totalDocuments, 3);
    assert.equal(stats.contentTypeCount, 2);
    assert.equal(stats.localeCount, 2);
    assert.deepEqual(stats.contentTypes, ['author', 'blogPost']);
    assert.deepEqual(stats.locales, ['en', 'es']);
  });

  it('handles empty array', () => {
    const stats = getDocumentStats([]);
    assert.equal(stats.totalDocuments, 0);
    assert.equal(stats.contentTypeCount, 0);
    assert.equal(stats.localeCount, 0);
  });

  it('handles documents without contentType or locale', () => {
    const docs = [{ id: '1', contentType: '', fields: {} }];
    const stats = getDocumentStats(docs);
    assert.equal(stats.totalDocuments, 1);
    assert.equal(stats.contentTypeCount, 0);
    assert.equal(stats.localeCount, 0);
  });
});

describe('readDocumentsStream', () => {
  let tmpDir;

  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  it('yields documents one at a time from NDJSON', async () => {
    tmpDir = createTmpDir();
    const ndjson = sampleDocs.map(d => JSON.stringify(d)).join('\n') + '\n';
    const filePath = path.join(tmpDir, 'data.ndjson');
    fs.writeFileSync(filePath, ndjson);

    const docs = [];
    for await (const doc of readDocumentsStream(filePath)) {
      docs.push(doc);
    }

    assert.equal(docs.length, 3);
    assert.equal(docs[0].id, '1');
    assert.equal(docs[2].locale, 'es');
  });

  it('applies transform to each document', async () => {
    tmpDir = createTmpDir();
    const ndjson = sampleDocs.map(d => JSON.stringify(d)).join('\n');
    const filePath = path.join(tmpDir, 'data.ndjson');
    fs.writeFileSync(filePath, ndjson);

    const docs = [];
    for await (const doc of readDocumentsStream(filePath, {
      transform: (d) => ({ ...d as Record<string, unknown>, locale: 'transformed' } as any),
    })) {
      docs.push(doc);
    }

    assert.equal(docs.length, 3);
    assert.ok(docs.every(d => d.locale === 'transformed'));
  });

  it('skips malformed lines', async () => {
    tmpDir = createTmpDir();
    const content = '{"id":"1","contentType":"a","fields":{}}\nBAD_LINE\n{"id":"2","contentType":"b","fields":{}}\n';
    const filePath = path.join(tmpDir, 'data.ndjson');
    fs.writeFileSync(filePath, content);

    const docs = [];
    for await (const doc of readDocumentsStream(filePath)) {
      docs.push(doc);
    }

    assert.equal(docs.length, 2);
  });

  it('throws for non-existent file', async () => {
    await assert.rejects(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of readDocumentsStream('/nonexistent/file.ndjson')) { /* consume */ }
    }, /does not exist/);
  });
});
