/**
 * Content Model Simulator — JSON Writer
 *
 * Writes the simulation report to disk as structured JSON files:
 *  - content-types/           — individual CT definitions
 *  - entries/                 — entries grouped by CT
 *  - assets.json              — all assets
 *  - validation-report.json   — errors + warnings
 *  - manifest.json            — summary / stats
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SimulationReport, WriteOptions, WriteResult } from '../types.js';

export function writeReport(report: SimulationReport, outDir: string, options: WriteOptions = {}): WriteResult {
  const { pretty = true, splitEntries = true } = options;
  const fmt = (obj: unknown) => JSON.stringify(obj, null, pretty ? 2 : 0);

  // Ensure root dir
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // ── Content Type Definitions ──────────────────────────────
  const ctDir = join(outDir, 'content-types');
  if (!existsSync(ctDir)) mkdirSync(ctDir, { recursive: true });

  for (const [ctId, ct] of Object.entries(report.contentTypes)) {
    const safeName = ctId.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeFileSync(join(ctDir, `${safeName}.json`), fmt(ct), 'utf-8');
  }

  // ── Entries ───────────────────────────────────────────────
  if (splitEntries) {
    const entriesDir = join(outDir, 'entries');
    if (!existsSync(entriesDir)) mkdirSync(entriesDir, { recursive: true });

    const byCt: Record<string, typeof report.entries> = {};
    for (const entry of report.entries) {
      if (!byCt[entry.contentType]) byCt[entry.contentType] = [];
      byCt[entry.contentType].push(entry);
    }
    for (const [ct, entries] of Object.entries(byCt)) {
      writeFileSync(join(entriesDir, `${ct}.json`), fmt(entries), 'utf-8');
    }
  } else {
    writeFileSync(join(outDir, 'entries.json'), fmt(report.entries), 'utf-8');
  }

  // ── Assets ────────────────────────────────────────────────
  writeFileSync(join(outDir, 'assets.json'), fmt(report.assets), 'utf-8');

  // ── Validation Report ─────────────────────────────────────
  writeFileSync(
    join(outDir, 'validation-report.json'),
    fmt({ errors: report.errors, warnings: report.warnings }),
    'utf-8'
  );

  // ── Page Entry (if present) ───────────────────────────────
  if (report.pageEntry) {
    writeFileSync(join(outDir, 'page-entry.json'), fmt(report.pageEntry), 'utf-8');
  }

  // ── Manifest ──────────────────────────────────────────────
  const manifest = {
    name: report.page,
    timestamp: report.timestamp,
    baseLocale: report.baseLocale,
    locales: report.locales,
    stats: report.stats,
    contentTypeIds: Object.keys(report.contentTypes),
  };
  writeFileSync(join(outDir, 'manifest.json'), fmt(manifest), 'utf-8');

  return {
    outputDir: outDir,
    filesWritten: countFiles(report, splitEntries),
  };
}

function countFiles(report: SimulationReport, splitEntries: boolean): number {
  const ctFiles = Object.keys(report.contentTypes).length;
  const entryFiles = splitEntries
    ? new Set(report.entries.map(e => e.contentType)).size
    : 1;
  // CT defs + entry files + assets + validation + manifest + (page-entry?)
  return ctFiles + entryFiles + 2 + 1 + (report.pageEntry ? 1 : 0);
}
