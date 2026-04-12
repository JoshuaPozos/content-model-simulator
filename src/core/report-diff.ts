/**
 * Content Model Simulator — Report Diff
 *
 * Compares two simulation output directories (containing manifest.json,
 * content-types/, entries/, validation-report.json) and reports differences
 * in schemas, entries, warnings, errors, and stats.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { ReportIssue, ReportStats, ContentTypeDefinition } from '../types.js';
import { diffSchemas, formatDiff } from './schema-diff.js';
import type { SchemaDiffResult } from './schema-diff.js';

// ── Types ────────────────────────────────────────────────────────

export interface EntryCountChange {
  contentTypeId: string;
  oldCount: number;
  newCount: number;
  delta: number;
}

export interface IssueDiff {
  added: ReportIssue[];
  resolved: ReportIssue[];
}

export interface StatDelta {
  key: string;
  old: number;
  new: number;
  delta: number;
}

export interface ReportDiffResult {
  oldName: string;
  newName: string;
  oldTimestamp: string;
  newTimestamp: string;
  schemaDiff: SchemaDiffResult;
  entryDiff: {
    byContentType: EntryCountChange[];
    totalOld: number;
    totalNew: number;
  };
  errorDiff: IssueDiff;
  warningDiff: IssueDiff;
  statsDiff: StatDelta[];
}

// ── Helpers ──────────────────────────────────────────────────────

function readJSON(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function issueKey(issue: ReportIssue): string {
  return `${issue.type}|${issue.contentType ?? ''}|${issue.field ?? ''}|${issue.entryId ?? ''}|${issue.message ?? ''}`;
}

function loadSchemasFromDir(dir: string): Record<string, ContentTypeDefinition> {
  const schemas: Record<string, ContentTypeDefinition> = {};
  if (!existsSync(dir)) return schemas;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const ct = readJSON(join(dir, file)) as ContentTypeDefinition;
    const id = ct.id ?? basename(file, '.json');
    schemas[id] = ct;
  }
  return schemas;
}

function loadEntryCounts(dir: string): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!existsSync(dir)) return counts;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const ctId = basename(file, '.json');
    const entries = readJSON(join(dir, file));
    counts[ctId] = Array.isArray(entries) ? entries.length : 0;
  }
  return counts;
}

// ── Core diff function ───────────────────────────────────────────

export function diffReports(oldDir: string, newDir: string): ReportDiffResult {
  // Load manifests
  const oldManifest = readJSON(join(oldDir, 'manifest.json')) as Record<string, unknown>;
  const newManifest = readJSON(join(newDir, 'manifest.json')) as Record<string, unknown>;

  // Schema diff — reuse existing diffSchemas
  const oldSchemas = loadSchemasFromDir(join(oldDir, 'content-types'));
  const newSchemas = loadSchemasFromDir(join(newDir, 'content-types'));
  const schemaDiff = diffSchemas(oldSchemas, newSchemas);

  // Entry counts
  const oldCounts = loadEntryCounts(join(oldDir, 'entries'));
  const newCounts = loadEntryCounts(join(newDir, 'entries'));
  const allCTs = new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)]);
  const byContentType: EntryCountChange[] = [];
  let totalOld = 0, totalNew = 0;
  for (const ctId of [...allCTs].sort()) {
    const o = oldCounts[ctId] ?? 0;
    const n = newCounts[ctId] ?? 0;
    totalOld += o;
    totalNew += n;
    if (o !== n) {
      byContentType.push({ contentTypeId: ctId, oldCount: o, newCount: n, delta: n - o });
    }
  }

  // Issues diff
  const oldValidation = (existsSync(join(oldDir, 'validation-report.json'))
    ? readJSON(join(oldDir, 'validation-report.json'))
    : { errors: [], warnings: [] }) as { errors: ReportIssue[]; warnings: ReportIssue[] };
  const newValidation = (existsSync(join(newDir, 'validation-report.json'))
    ? readJSON(join(newDir, 'validation-report.json'))
    : { errors: [], warnings: [] }) as { errors: ReportIssue[]; warnings: ReportIssue[] };

  const errorDiff = diffIssues(oldValidation.errors, newValidation.errors);
  const warningDiff = diffIssues(oldValidation.warnings, newValidation.warnings);

  // Stats diff
  const oldStats = (oldManifest.stats ?? {}) as Record<string, number>;
  const newStats = (newManifest.stats ?? {}) as Record<string, number>;
  const statKeys = new Set([...Object.keys(oldStats), ...Object.keys(newStats)]);
  const statsDiff: StatDelta[] = [];
  for (const key of [...statKeys].sort()) {
    const o = (oldStats[key] as number) ?? 0;
    const n = (newStats[key] as number) ?? 0;
    if (o !== n) {
      statsDiff.push({ key, old: o, new: n, delta: n - o });
    }
  }

  return {
    oldName: (oldManifest.name as string) ?? oldDir,
    newName: (newManifest.name as string) ?? newDir,
    oldTimestamp: (oldManifest.timestamp as string) ?? '',
    newTimestamp: (newManifest.timestamp as string) ?? '',
    schemaDiff,
    entryDiff: { byContentType, totalOld, totalNew },
    errorDiff,
    warningDiff,
    statsDiff,
  };
}

function diffIssues(oldIssues: ReportIssue[], newIssues: ReportIssue[]): IssueDiff {
  const oldSet = new Set(oldIssues.map(issueKey));
  const newSet = new Set(newIssues.map(issueKey));

  const added = newIssues.filter(i => !oldSet.has(issueKey(i)));
  const resolved = oldIssues.filter(i => !newSet.has(issueKey(i)));

  return { added, resolved };
}

// ── Format as text ───────────────────────────────────────────────

export function formatReportDiff(result: ReportDiffResult, { color = true } = {}): string {
  const c = color
    ? { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' }
    : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', cyan: '' };

  const lines: string[] = [];

  // Header
  lines.push(`${c.dim}Old: ${result.oldName} (${result.oldTimestamp || 'no timestamp'})${c.reset}`);
  lines.push(`${c.dim}New: ${result.newName} (${result.newTimestamp || 'no timestamp'})${c.reset}`);
  lines.push('');

  // Schema changes
  lines.push(`${c.bold}Schema Changes${c.reset}`);
  if (result.schemaDiff.changes.length === 0) {
    lines.push(`  ${c.green}No schema changes.${c.reset}`);
  } else {
    lines.push(formatDiff(result.schemaDiff, { color }).split('\n').map(l => '  ' + l).join('\n'));
  }
  lines.push('');

  // Entry changes
  lines.push(`${c.bold}Entry Changes${c.reset}`);
  const { entryDiff } = result;
  if (entryDiff.byContentType.length === 0) {
    lines.push(`  ${c.green}No entry count changes.${c.reset}`);
  } else {
    for (const ct of entryDiff.byContentType) {
      const sign = ct.delta > 0 ? `${c.green}+${ct.delta}` : `${c.red}${ct.delta}`;
      lines.push(`  ${sign}${c.reset} ${c.bold}${ct.contentTypeId}${c.reset} ${c.dim}(${ct.oldCount} → ${ct.newCount})${c.reset}`);
    }
    const totalDelta = entryDiff.totalNew - entryDiff.totalOld;
    const totalSign = totalDelta > 0 ? `+${totalDelta}` : `${totalDelta}`;
    lines.push(`  ${c.dim}Total: ${entryDiff.totalOld} → ${entryDiff.totalNew} (${totalSign})${c.reset}`);
  }
  lines.push('');

  // Issues
  const hasIssueDiff = result.errorDiff.added.length > 0 || result.errorDiff.resolved.length > 0
    || result.warningDiff.added.length > 0 || result.warningDiff.resolved.length > 0;

  lines.push(`${c.bold}Issues${c.reset}`);
  if (!hasIssueDiff) {
    lines.push(`  ${c.green}No issue changes.${c.reset}`);
  } else {
    if (result.errorDiff.added.length > 0) {
      lines.push(`  ${c.red}+${result.errorDiff.added.length} new errors${c.reset}`);
      for (const e of result.errorDiff.added.slice(0, 5)) {
        lines.push(`    ${c.dim}${e.type}: ${e.message ?? e.contentType ?? ''}${c.reset}`);
      }
      if (result.errorDiff.added.length > 5) {
        lines.push(`    ${c.dim}...and ${result.errorDiff.added.length - 5} more${c.reset}`);
      }
    }
    if (result.errorDiff.resolved.length > 0) {
      lines.push(`  ${c.green}-${result.errorDiff.resolved.length} errors resolved${c.reset}`);
    }
    if (result.warningDiff.added.length > 0) {
      lines.push(`  ${c.yellow}+${result.warningDiff.added.length} new warnings${c.reset}`);
      for (const w of result.warningDiff.added.slice(0, 5)) {
        lines.push(`    ${c.dim}${w.type}: ${w.message ?? w.contentType ?? ''}${c.reset}`);
      }
      if (result.warningDiff.added.length > 5) {
        lines.push(`    ${c.dim}...and ${result.warningDiff.added.length - 5} more${c.reset}`);
      }
    }
    if (result.warningDiff.resolved.length > 0) {
      lines.push(`  ${c.green}-${result.warningDiff.resolved.length} warnings resolved${c.reset}`);
    }
  }
  lines.push('');

  // Stats
  lines.push(`${c.bold}Stats${c.reset}`);
  if (result.statsDiff.length === 0) {
    lines.push(`  ${c.green}No stat changes.${c.reset}`);
  } else {
    for (const s of result.statsDiff) {
      const sign = s.delta > 0 ? `${c.green}+${s.delta}` : `${c.red}${s.delta}`;
      lines.push(`  ${sign}${c.reset} ${s.key} ${c.dim}(${s.old} → ${s.new})${c.reset}`);
    }
  }

  return lines.join('\n');
}
