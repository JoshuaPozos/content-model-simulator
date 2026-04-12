/**
 * Content Model Simulator — Schema Diff
 *
 * Compares two sets of content type definitions and reports
 * added, removed, and changed content types and fields.
 */

import type { ContentTypeDefinition, ContentTypeField } from '../types.js';

// ── Types ────────────────────────────────────────────────────────

export type ChangeKind = 'added' | 'removed' | 'changed';

export interface FieldChange {
  fieldId: string;
  kind: ChangeKind;
  details?: string;
}

export interface ContentTypeChange {
  contentTypeId: string;
  kind: ChangeKind;
  fieldChanges: FieldChange[];
}

export interface SchemaDiffResult {
  changes: ContentTypeChange[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

// ── Core diff function ───────────────────────────────────────────

export function diffSchemas(
  oldSchemas: Record<string, ContentTypeDefinition>,
  newSchemas: Record<string, ContentTypeDefinition>,
): SchemaDiffResult {
  const changes: ContentTypeChange[] = [];
  const allIds = new Set([...Object.keys(oldSchemas), ...Object.keys(newSchemas)]);

  let added = 0, removed = 0, changed = 0, unchanged = 0;

  for (const id of [...allIds].sort()) {
    const oldCT = oldSchemas[id];
    const newCT = newSchemas[id];

    if (!oldCT) {
      // Added
      added++;
      changes.push({
        contentTypeId: id,
        kind: 'added',
        fieldChanges: (newCT.fields || []).map(f => ({
          fieldId: f.id,
          kind: 'added' as ChangeKind,
        })),
      });
    } else if (!newCT) {
      // Removed
      removed++;
      changes.push({
        contentTypeId: id,
        kind: 'removed',
        fieldChanges: (oldCT.fields || []).map(f => ({
          fieldId: f.id,
          kind: 'removed' as ChangeKind,
        })),
      });
    } else {
      // Possibly changed — compare fields
      const fieldChanges = diffFields(oldCT.fields || [], newCT.fields || []);
      if (fieldChanges.length > 0) {
        changed++;
        changes.push({ contentTypeId: id, kind: 'changed', fieldChanges });
      } else {
        unchanged++;
      }
    }
  }

  return { changes, summary: { added, removed, changed, unchanged } };
}

// ── Field comparison ─────────────────────────────────────────────

function diffFields(oldFields: ContentTypeField[], newFields: ContentTypeField[]): FieldChange[] {
  const changes: FieldChange[] = [];
  const oldMap = new Map(oldFields.map(f => [f.id, f]));
  const newMap = new Map(newFields.map(f => [f.id, f]));

  const allFieldIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const fieldId of allFieldIds) {
    const oldF = oldMap.get(fieldId);
    const newF = newMap.get(fieldId);

    if (!oldF) {
      changes.push({ fieldId, kind: 'added' });
    } else if (!newF) {
      changes.push({ fieldId, kind: 'removed' });
    } else {
      const diffs = compareField(oldF, newF);
      if (diffs.length > 0) {
        changes.push({ fieldId, kind: 'changed', details: diffs.join(', ') });
      }
    }
  }

  return changes;
}

function compareField(a: ContentTypeField, b: ContentTypeField): string[] {
  const diffs: string[] = [];

  if (a.type !== b.type) diffs.push(`type: ${a.type} → ${b.type}`);
  if (a.linkType !== b.linkType) diffs.push(`linkType: ${a.linkType || 'none'} → ${b.linkType || 'none'}`);
  if (!!a.required !== !!b.required) diffs.push(`required: ${!!a.required} → ${!!b.required}`);
  if (!!a.localized !== !!b.localized) diffs.push(`localized: ${!!a.localized} → ${!!b.localized}`);
  if (!!a.disabled !== !!b.disabled) diffs.push(`disabled: ${!!a.disabled} → ${!!b.disabled}`);
  if (a.name !== b.name) diffs.push(`name: "${a.name}" → "${b.name}"`);

  // Compare items (for Array fields)
  if (a.items?.type !== b.items?.type) diffs.push(`items.type: ${a.items?.type || 'none'} → ${b.items?.type || 'none'}`);
  if (a.items?.linkType !== b.items?.linkType) diffs.push(`items.linkType: ${a.items?.linkType || 'none'} → ${b.items?.linkType || 'none'}`);

  return diffs;
}

// ── Format as text ───────────────────────────────────────────────

export function formatDiff(result: SchemaDiffResult, { color = true } = {}): string {
  const c = color
    ? { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' }
    : { reset: '', bold: '', dim: '', red: '', green: '', yellow: '', cyan: '' };

  const lines: string[] = [];

  if (result.changes.length === 0) {
    lines.push(`${c.green}No differences found.${c.reset}`);
    return lines.join('\n');
  }

  for (const ct of result.changes) {
    const icon = ct.kind === 'added' ? `${c.green}+` : ct.kind === 'removed' ? `${c.red}-` : `${c.yellow}~`;
    lines.push(`${icon} ${c.bold}${ct.contentTypeId}${c.reset} (${ct.kind})`);

    for (const fc of ct.fieldChanges) {
      const fIcon = fc.kind === 'added' ? `${c.green}  +` : fc.kind === 'removed' ? `${c.red}  -` : `${c.yellow}  ~`;
      const detail = fc.details ? ` ${c.dim}(${fc.details})${c.reset}` : '';
      lines.push(`${fIcon} ${fc.fieldId}${c.reset}${detail}`);
    }

    lines.push('');
  }

  const s = result.summary;
  lines.push(`${c.cyan}Summary:${c.reset} ${c.green}+${s.added}${c.reset} added, ${c.red}-${s.removed}${c.reset} removed, ${c.yellow}~${s.changed}${c.reset} changed, ${s.unchanged} unchanged`);

  return lines.join('\n');
}
