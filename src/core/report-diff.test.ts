import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { diffReports, formatReportDiff } from './report-diff.js';

function setupDir(base: string, data: {
  manifest: Record<string, unknown>;
  schemas?: Record<string, unknown>[];
  entries?: Record<string, unknown[]>;
  validation?: { errors: unknown[]; warnings: unknown[] };
}) {
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'manifest.json'), JSON.stringify(data.manifest), 'utf-8');

  if (data.schemas) {
    const ctDir = join(base, 'content-types');
    mkdirSync(ctDir, { recursive: true });
    for (const s of data.schemas) {
      writeFileSync(join(ctDir, `${s.id}.json`), JSON.stringify(s), 'utf-8');
    }
  }

  if (data.entries) {
    const eDir = join(base, 'entries');
    mkdirSync(eDir, { recursive: true });
    for (const [ct, entries] of Object.entries(data.entries)) {
      writeFileSync(join(eDir, `${ct}.json`), JSON.stringify(entries), 'utf-8');
    }
  }

  if (data.validation) {
    writeFileSync(join(base, 'validation-report.json'), JSON.stringify(data.validation), 'utf-8');
  }
}

describe('diffReports', () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = join(tmpdir(), `report-diff-test-${Date.now()}`);
    mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true });
  });

  it('reports no differences for identical reports', () => {
    const data = {
      manifest: { name: 'test', timestamp: '2025-01-01', stats: { totalEntries: 5, totalCTs: 2 } },
      schemas: [
        { id: 'page', name: 'Page', fields: [{ id: 'title', name: 'Title', type: 'Symbol' }] },
      ],
      entries: { page: [{}, {}, {}] },
      validation: { errors: [], warnings: [] },
    };
    setupDir(join(tmpBase, 'old'), data);
    setupDir(join(tmpBase, 'new'), data);

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    assert.equal(result.schemaDiff.changes.length, 0);
    assert.equal(result.entryDiff.byContentType.length, 0);
    assert.equal(result.errorDiff.added.length, 0);
    assert.equal(result.errorDiff.resolved.length, 0);
    assert.equal(result.warningDiff.added.length, 0);
    assert.equal(result.statsDiff.length, 0);
  });

  it('detects schema changes', () => {
    const oldData = {
      manifest: { name: 'v1', timestamp: '2025-01-01', stats: {} },
      schemas: [
        { id: 'page', name: 'Page', fields: [{ id: 'title', name: 'Title', type: 'Symbol' }] },
      ],
    };
    const newData = {
      manifest: { name: 'v2', timestamp: '2025-01-02', stats: {} },
      schemas: [
        { id: 'page', name: 'Page', fields: [
          { id: 'title', name: 'Title', type: 'Symbol' },
          { id: 'slug', name: 'Slug', type: 'Symbol' },
        ] },
        { id: 'author', name: 'Author', fields: [{ id: 'name', name: 'Name', type: 'Symbol' }] },
      ],
    };
    setupDir(join(tmpBase, 'old'), oldData);
    setupDir(join(tmpBase, 'new'), newData);

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    assert.equal(result.schemaDiff.summary.added, 1);
    assert.equal(result.schemaDiff.summary.changed, 1);
    assert.equal(result.oldName, 'v1');
    assert.equal(result.newName, 'v2');
  });

  it('detects entry count changes', () => {
    const manifest = { name: 'test', timestamp: '2025-01-01', stats: {} };
    setupDir(join(tmpBase, 'old'), {
      manifest,
      entries: { page: [{}, {}], article: [{}, {}, {}] },
    });
    setupDir(join(tmpBase, 'new'), {
      manifest,
      entries: { page: [{}, {}, {}, {}], article: [{}, {}, {}] },
    });

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    assert.equal(result.entryDiff.byContentType.length, 1); // only page changed
    const pageChange = result.entryDiff.byContentType[0];
    assert.equal(pageChange.contentTypeId, 'page');
    assert.equal(pageChange.delta, 2);
    assert.equal(result.entryDiff.totalOld, 5);
    assert.equal(result.entryDiff.totalNew, 7);
  });

  it('detects new and resolved warnings', () => {
    setupDir(join(tmpBase, 'old'), {
      manifest: { name: 'test', timestamp: '2025-01-01', stats: {} },
      validation: {
        errors: [],
        warnings: [
          { type: 'MISSING_FIELD', contentType: 'page', field: 'slug' },
        ],
      },
    });
    setupDir(join(tmpBase, 'new'), {
      manifest: { name: 'test', timestamp: '2025-01-02', stats: {} },
      validation: {
        errors: [],
        warnings: [
          { type: 'MISSING_FIELD', contentType: 'article', field: 'body' },
        ],
      },
    });

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    assert.equal(result.warningDiff.added.length, 1);
    assert.equal(result.warningDiff.resolved.length, 1);
    assert.equal(result.warningDiff.added[0].contentType, 'article');
    assert.equal(result.warningDiff.resolved[0].contentType, 'page');
  });

  it('detects stats changes', () => {
    setupDir(join(tmpBase, 'old'), {
      manifest: { name: 'test', timestamp: '2025-01-01', stats: { totalEntries: 10, totalCTs: 3, totalWarnings: 2 } },
    });
    setupDir(join(tmpBase, 'new'), {
      manifest: { name: 'test', timestamp: '2025-01-02', stats: { totalEntries: 15, totalCTs: 3, totalWarnings: 0 } },
    });

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    assert.equal(result.statsDiff.length, 2); // totalEntries and totalWarnings changed, totalCTs same
    const entryStat = result.statsDiff.find(s => s.key === 'totalEntries');
    assert.ok(entryStat);
    assert.equal(entryStat.delta, 5);
    const warnStat = result.statsDiff.find(s => s.key === 'totalWarnings');
    assert.ok(warnStat);
    assert.equal(warnStat.delta, -2);
  });

  it('handles missing entries and validation dirs gracefully', () => {
    setupDir(join(tmpBase, 'old'), {
      manifest: { name: 'test', timestamp: '2025-01-01', stats: {} },
    });
    setupDir(join(tmpBase, 'new'), {
      manifest: { name: 'test', timestamp: '2025-01-02', stats: {} },
    });

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    assert.equal(result.entryDiff.byContentType.length, 0);
    assert.equal(result.errorDiff.added.length, 0);
    assert.equal(result.warningDiff.added.length, 0);
  });
});

describe('formatReportDiff', () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = join(tmpdir(), `report-diff-fmt-${Date.now()}`);
    mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true });
  });

  it('produces readable text output', () => {
    setupDir(join(tmpBase, 'old'), {
      manifest: { name: 'v1', timestamp: '2025-01-01', stats: { totalEntries: 5 } },
      schemas: [{ id: 'page', name: 'Page', fields: [{ id: 'title', name: 'Title', type: 'Symbol' }] }],
      entries: { page: [{}, {}] },
      validation: { errors: [], warnings: [] },
    });
    setupDir(join(tmpBase, 'new'), {
      manifest: { name: 'v2', timestamp: '2025-01-02', stats: { totalEntries: 8 } },
      schemas: [
        { id: 'page', name: 'Page', fields: [{ id: 'title', name: 'Title', type: 'Symbol' }, { id: 'slug', name: 'Slug', type: 'Symbol' }] },
      ],
      entries: { page: [{}, {}, {}, {}] },
      validation: { errors: [], warnings: [{ type: 'NEW_WARN', message: 'test' }] },
    });

    const result = diffReports(join(tmpBase, 'old'), join(tmpBase, 'new'));
    const text = formatReportDiff(result, { color: false });

    assert.ok(text.includes('Schema Changes'));
    assert.ok(text.includes('Entry Changes'));
    assert.ok(text.includes('Issues'));
    assert.ok(text.includes('Stats'));
    assert.ok(text.includes('v1'));
    assert.ok(text.includes('v2'));
  });
});
