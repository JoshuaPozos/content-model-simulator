/**
 * Content Model Simulator — Model Graph HTML Generator
 */

import type { SimulationReport, Entry } from '../types.js';

export interface GraphHTMLOptions {
  customCSS?: string;
  customHead?: string;
}

interface CTRelationship {
  from: string;
  to: string;
  fieldName: string;
  count: number;
}

export function generateModelGraphHTML(report: SimulationReport, options: GraphHTMLOptions = {}): string {
  // Pre-compute CT→CT relationship edges
  const ctRelationships: CTRelationship[] = [];
  const relMap = new Map<string, CTRelationship>();
  const entryIdToEntry = new Map<string, Entry>();
  for (const e of report.entries) {
    entryIdToEntry.set(e.id, e);
    if (e.sourceId) entryIdToEntry.set(e.sourceId, e);
  }

  for (const entry of report.entries) {
    for (const [fieldName, fw] of Object.entries(entry.fields)) {
      const val = fw?.[report.baseLocale] as any;
      const targets: string[] = [];
      if (val?.sys?.linkType === 'Entry') targets.push(val.sys.id);
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item?.sys?.linkType === 'Entry') targets.push(item.sys.id);
          if (item && typeof item === 'object' && !(item as any).sys) {
            for (const subVal of Object.values(item as Record<string, any>)) {
              if (subVal?.sys?.linkType === 'Entry') targets.push(subVal.sys.id);
            }
          }
        }
      }
      for (const targetId of targets) {
        const targetEntry = entryIdToEntry.get(targetId);
        if (targetEntry) {
          const key = `${entry.contentType}→${targetEntry.contentType}`;
          if (!relMap.has(key)) relMap.set(key, { from: entry.contentType, to: targetEntry.contentType, fieldName, count: 0 });
          relMap.get(key)!.count++;
        }
      }
    }
  }

  // Page → component CTs
  if (report.pageEntry) {
    const ctsInPage = new Set<string>();
    const allComponentIds = Object.values(report.pageEntry.sections).flat();
    for (const compId of allComponentIds) {
      const entry = report.entries.find(e => e.id === compId);
      if (entry) ctsInPage.add(entry.contentType);
    }
    for (const ct of ctsInPage) {
      const key = `page→${ct}`;
      if (!relMap.has(key)) relMap.set(key, { from: 'page', to: ct, fieldName: 'sections', count: 0 });
    }
  }

  ctRelationships.push(...relMap.values());

  const graphData = {
    contentTypes: report.contentTypes,
    entries: report.entries,
    pageEntry: report.pageEntry,
    assets: report.assets,
    errors: report.errors,
    warnings: report.warnings,
    stats: report.stats,
    locales: report.locales,
    baseLocale: report.baseLocale,
    page: report.page,
    timestamp: report.timestamp,
    ctRelationships,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Content Model: ${escapeHtml(report.page)}</title>
<style>
${GRAPH_CSS}
${options.customCSS ? `\n/* ── Custom CSS ──────────────── */\n${options.customCSS}` : ''}
</style>
${options.customHead || ''}
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>Content Model: <span style="color:#A5B4FC">${escapeHtml(report.page)}</span></h1>
    <div class="sub">${report.timestamp} · ${report.locales.length} locales · <a href="content-browser.html" style="color:#A5B4FC;text-decoration:underline;cursor:pointer">Browse Entries</a></div>
  </div>
  <div class="stats-row">
    <div class="stat-pill"><span class="num">${report.stats.totalCTs}</span><span class="lbl">Types</span></div>
    <div class="stat-pill"><span class="num">${report.stats.totalComponents}</span><span class="lbl">Entries</span></div>
    <div class="stat-pill"><span class="num">${report.stats.totalAssets}</span><span class="lbl">Assets</span></div>
    <div class="stat-pill"><span class="num">${report.stats.totalLocales}</span><span class="lbl">Locales</span></div>
    <div class="stat-pill ${report.stats.totalErrors > 0 ? 'err' : ''}"><span class="num">${report.stats.totalErrors}</span><span class="lbl">Errors</span></div>
    <div class="stat-pill ${report.stats.totalWarnings > 0 ? 'warn' : ''}"><span class="num">${report.stats.totalWarnings}</span><span class="lbl">Warns</span></div>
  </div>
</div>

<div class="main">
  <div class="canvas-wrap">
    <div class="canvas" id="canvas"></div>
    <div class="legend">
      <h4>Relationships</h4>
      <div class="legend-row"><div class="swatch" style="background:#4F46E5"></div> Link:Entry (reference)</div>
      <div class="legend-row"><div class="swatch" style="background:#D97706"></div> Page → Component</div>
    </div>
    <div class="zoom-ctrl">
      <button id="zoomIn" title="Zoom in">+</button>
      <button id="zoomOut" title="Zoom out">−</button>
      <button id="zoomFit" title="Fit all">⊡</button>
    </div>
  </div>
  <div class="sidebar">
    <div class="tab-bar">
      <button class="active" data-tab="ct-tab">Types (${report.stats.totalCTs})</button>
      <button data-tab="entries-tab">Entries (${report.stats.totalComponents})</button>
      <button data-tab="issues-tab">Issues (${report.stats.totalErrors + report.stats.totalWarnings})</button>
    </div>
    <div id="ct-tab" class="tab-content active">
      <div class="filter-bar"><input type="text" id="ct-filter" placeholder="Filter content types..."></div>
      <ul class="list" id="ct-list"></ul>
    </div>
    <div id="entries-tab" class="tab-content">
      <div class="filter-bar"><input type="text" id="entry-filter" placeholder="Filter entries..."></div>
      <ul class="list" id="entry-list"></ul>
    </div>
    <div id="issues-tab" class="tab-content">
      <ul class="list" id="issue-list"></ul>
    </div>
  </div>
</div>

<div class="detail-panel" id="detail-panel">
  <button class="close" onclick="document.getElementById('detail-panel').classList.remove('open')">✕</button>
  <div id="detail-content"></div>
</div>

<script>
const DATA = ${JSON.stringify(graphData, null, 0).replace(/<\//g, '<\\/')};
${GRAPH_JS}
</script>
</body>
</html>`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════
const GRAPH_CSS = `
:root {
  --bg: #F8F9FC; --bg-dot: #E2E5ED; --card-bg: #FFFFFF; --card-border: #DDE0E8;
  --card-shadow: 0 2px 8px rgba(0,0,0,0.08); --text: #1A1D29; --text-muted: #6B7280;
  --accent: #4F46E5; --accent-light: #EEF2FF; --edge: #94A3B8; --edge-hover: #4F46E5;
  --green: #059669; --orange: #D97706; --red: #DC2626; --blue: #2563EB;
  --sidebar-bg: #111827; --sidebar-text: #E5E7EB; --sidebar-muted: #6B7280;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--sidebar-bg); color: var(--text); overflow: hidden; height: 100vh; }

.header { background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; }
.header-left h1 { font-size: 1.15rem; color: #fff; font-weight: 600; }
.header-left .sub { color: #A5B4FC; font-size: 0.75rem; margin-top: 2px; }
.stats-row { display: flex; gap: 18px; }
.stat-pill { background: rgba(255,255,255,0.1); border-radius: 20px; padding: 4px 14px; display: flex; align-items: center; gap: 6px; }
.stat-pill .num { font-weight: 700; font-size: 0.95rem; color: #fff; }
.stat-pill .lbl { font-size: 0.65rem; color: #C7D2FE; text-transform: uppercase; letter-spacing: 0.5px; }
.stat-pill.err .num { color: #FCA5A5; }
.stat-pill.warn .num { color: #FCD34D; }

.main { display: grid; grid-template-columns: 1fr 340px; height: calc(100vh - 56px); }

.canvas-wrap { position: relative; overflow: hidden; background: var(--bg); }
.canvas-wrap::before { content: ''; position: absolute; inset: 0; z-index: 0; background-image: radial-gradient(var(--bg-dot) 1px, transparent 1px); background-size: 24px 24px; }
.canvas { position: absolute; inset: 0; z-index: 1; }
svg.graph { width: 100%; height: 100%; }

.sidebar { background: var(--sidebar-bg); border-left: 1px solid #1F2937; overflow-y: auto; color: var(--sidebar-text); }
.tab-bar { display: flex; border-bottom: 1px solid #374151; }
.tab-bar button { flex: 1; background: none; border: none; color: var(--sidebar-muted); padding: 10px 4px; cursor: pointer; font-size: 0.78rem; border-bottom: 2px solid transparent; transition: all 0.15s; }
.tab-bar button.active { color: #818CF8; border-bottom-color: #818CF8; }
.tab-bar button:hover { color: #C7D2FE; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.filter-bar { padding: 8px 12px; border-bottom: 1px solid #1F2937; }
.filter-bar input { width: 100%; background: #1F2937; border: 1px solid #374151; border-radius: 6px; padding: 6px 10px; color: #E5E7EB; font-size: 0.8rem; outline: none; }
.filter-bar input::placeholder { color: #4B5563; }
.filter-bar input:focus { border-color: #818CF8; }

.list { list-style: none; }
.list-item { padding: 10px 14px; border-bottom: 1px solid #1F2937; cursor: pointer; transition: background 0.12s; }
.list-item:hover { background: #1F2937; }
.list-item .title { font-weight: 600; font-size: 0.82rem; }
.list-item .meta { font-size: 0.68rem; color: #6B7280; margin-top: 2px; }
.list-item .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.issue-item { padding: 10px 14px; border-bottom: 1px solid #1F2937; font-size: 0.78rem; }
.issue-item.error { border-left: 3px solid var(--red); }
.issue-item.warning { border-left: 3px solid var(--orange); }
.issue-item .itype { font-weight: 700; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.5px; }
.issue-item .imsg { margin-top: 3px; color: #9CA3AF; font-size: 0.7rem; word-break: break-all; }

.detail-panel { position: fixed; top: 0; right: 0; width: 420px; height: 100vh; background: #1E1B4B; border-left: 2px solid #4F46E5; z-index: 200; overflow-y: auto; transform: translateX(100%); transition: transform 0.25s ease; color: #E5E7EB; }
.detail-panel.open { transform: translateX(0); }
.detail-panel .close { position: absolute; top: 10px; right: 14px; background: none; border: none; color: #9CA3AF; font-size: 1.2rem; cursor: pointer; }
.detail-panel h3 { padding: 16px; font-size: 1rem; border-bottom: 1px solid #312E81; }
.dp-section { padding: 12px 16px; border-bottom: 1px solid #312E81; }
.dp-section h4 { font-size: 0.7rem; color: #A5B4FC; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }
.dp-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 0.78rem; }
.dp-row .k { font-family: 'SF Mono', Monaco, monospace; color: #A5B4FC; }
.dp-row .v { color: #9CA3AF; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.legend { position: absolute; bottom: 14px; left: 14px; background: rgba(255,255,255,0.95); border: 1px solid var(--card-border); border-radius: 8px; padding: 10px 14px; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.legend h4 { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px; }
.legend-row { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--text); margin: 2px 0; }
.legend-row .swatch { width: 14px; height: 3px; border-radius: 2px; }

.zoom-ctrl { position: absolute; bottom: 14px; right: 14px; display: flex; flex-direction: column; gap: 4px; z-index: 10; }
.zoom-ctrl button { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--card-border); background: #fff; color: var(--text); cursor: pointer; font-size: 1rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.zoom-ctrl button:hover { background: var(--accent-light); color: var(--accent); }
`;

const GRAPH_JS = `
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
const canvas = document.getElementById('canvas');
let svgEl, gEl;
let viewBox = { x: 0, y: 0, w: 1400, h: 900 };
let scale = 1;
let panStart = null;
let dragNode = null, dragOffset = { x: 0, y: 0 };

const typeColor = {
  'Symbol': '#3B82F6', 'Text': '#8B5CF6', 'Integer': '#F59E0B', 'Number': '#F59E0B',
  'Boolean': '#10B981', 'Object': '#6366F1', 'Array': '#EC4899', 'Link': '#4F46E5',
  'RichText': '#8B5CF6', 'Date': '#F97316'
};

const ctEntries = Object.entries(DATA.contentTypes).filter(([,ct]) => ct.entryCount > 0 || ct.id === 'page');
const cardW = 260, cardHeaderH = 42, fieldH = 22, cardFooterH = 26, colGap = 160, rowGap = 40;

const rels = DATA.ctRelationships;

// Build adjacency: who references whom
const referencedBy = {};  // ctId → Set of CTs that reference it
const references = {};     // ctId → Set of CTs it references
ctEntries.forEach(([id]) => { referencedBy[id] = new Set(); references[id] = new Set(); });
for (const rel of rels) {
  if (references[rel.from]) references[rel.from].add(rel.to);
  if (referencedBy[rel.to]) referencedBy[rel.to].add(rel.from);
}

// Topological level assignment via BFS from roots (CTs not referenced by others)
const levels = {};
const allCtIds = ctEntries.map(([id]) => id);
const roots = allCtIds.filter(id => referencedBy[id].size === 0);
// If no pure roots (circular), pick CTs with highest out-degree
if (roots.length === 0) {
  const sorted = [...allCtIds].sort((a, b) => references[b].size - references[a].size);
  roots.push(sorted[0]);
}
// BFS
const queue = roots.map(id => ({ id, depth: 0 }));
const visited = new Set();
while (queue.length > 0) {
  const { id, depth } = queue.shift();
  if (visited.has(id)) { levels[id] = Math.max(levels[id] || 0, depth); continue; }
  visited.add(id);
  levels[id] = depth;
  for (const target of (references[id] || [])) {
    if (!visited.has(target)) queue.push({ id: target, depth: depth + 1 });
  }
}
// Assign unvisited CTs (disconnected) to level 0
allCtIds.forEach(id => { if (levels[id] === undefined) levels[id] = 0; });

const byLevel = {};
ctEntries.forEach(([id]) => {
  const lvl = levels[id];
  if (!byLevel[lvl]) byLevel[lvl] = [];
  byLevel[lvl].push(id);
});
// Sort within each level: more entries first, alphabetical tiebreak
Object.values(byLevel).forEach(ids => {
  ids.sort((a, b) => {
    const diff = (DATA.contentTypes[b]?.entryCount || 0) - (DATA.contentTypes[a]?.entryCount || 0);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
});

const positions = {};
let maxX = 0;
const sortedLevels = Object.keys(byLevel).sort((a,b) => a - b);
sortedLevels.forEach((lvl, li) => {
  const ids = byLevel[lvl];
  const x = li * (cardW + colGap) + 60;
  ids.forEach((id, i) => { positions[id] = { x, y: i * (cardHeaderH + cardFooterH + rowGap) + 60 }; });
  maxX = Math.max(maxX, x + cardW + 60);
});

// Vertically center each column relative to the tallest
const colHeights = sortedLevels.map(lvl => byLevel[lvl].length * (cardHeaderH + cardFooterH + rowGap));
const maxHeight = Math.max(...colHeights);
sortedLevels.forEach((lvl) => {
  const ids = byLevel[lvl];
  const totalH = ids.length * (cardHeaderH + cardFooterH + rowGap);
  const offsetY = (maxHeight - totalH) / 2;
  ids.forEach(id => { positions[id].y += offsetY; });
});

const expanded = {};

function render() {
  const maxY = Math.max(...ctEntries.map(([id]) => positions[id]?.y || 0)) + 400;
  viewBox.w = Math.max(maxX + 100, 1400);
  viewBox.h = Math.max(maxY, 900);

  let svg = '<svg class="graph" xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox.x + ' ' + viewBox.y + ' ' + (viewBox.w/scale) + ' ' + (viewBox.h/scale) + '">';
  svg += '<defs>';
  svg += '<marker id="arrow-blue" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#4F46E5"/></marker>';
  svg += '<marker id="arrow-orange" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto"><path d="M0,0 L10,4 L0,8 Z" fill="#D97706"/></marker>';
  svg += '<filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.08"/></filter>';
  svg += '</defs>';

  // Draw edges
  for (const rel of rels) {
    const fromPos = positions[rel.from];
    const toPos = positions[rel.to];
    if (!fromPos || !toPos) continue;
    const fromCt = DATA.contentTypes[rel.from];
    let fieldIdx = -1;
    if (fromCt?.fields) fieldIdx = fromCt.fields.findIndex(f => f.id === rel.fieldName);
    let x1 = fromPos.x + cardW, y1 = fromPos.y + cardHeaderH / 2;
    if (expanded[rel.from] && fieldIdx >= 0) y1 = fromPos.y + cardHeaderH + fieldIdx * fieldH + fieldH / 2;
    let x2 = toPos.x, y2 = toPos.y + cardHeaderH / 2;
    if (toPos.x < fromPos.x) { x1 = fromPos.x; x2 = toPos.x + cardW; }
    let color, marker;
    if (rel.from === 'page') { color = '#D97706'; marker = 'url(#arrow-orange)'; }
    else { color = '#4F46E5'; marker = 'url(#arrow-blue)'; }
    const dx = Math.abs(x2 - x1) * 0.5;
    const path = 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2;
    svg += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.8" marker-end="' + marker + '" opacity="0.7"/>';
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 6;
    svg += '<text x="' + mx + '" y="' + my + '" text-anchor="middle" fill="' + color + '" font-size="9" font-family="system-ui" font-weight="500">' + (rel.fieldName || '') + '</text>';
  }

  // Draw CT cards
  for (const [ctId, ct] of ctEntries) {
    const pos = positions[ctId];
    if (!pos) continue;
    const isExpanded = expanded[ctId];
    const h = getCardHeight(ctId);
    const fields = ct.fields || [];
    svg += '<g class="ct-node" data-ct="' + ctId + '">';
    svg += '<rect x="' + pos.x + '" y="' + pos.y + '" width="' + cardW + '" height="' + h + '" rx="10" ry="10" fill="white" stroke="#DDE0E8" stroke-width="1.5" filter="url(#cardShadow)"/>';
    svg += '<rect x="' + pos.x + '" y="' + pos.y + '" width="' + cardW + '" height="' + cardHeaderH + '" rx="10" ry="10" fill="white" style="cursor:pointer"/>';
    if (isExpanded) svg += '<rect x="' + pos.x + '" y="' + (pos.y + cardHeaderH - 10) + '" width="' + cardW + '" height="10" fill="white"/>';
    svg += '<line x1="' + pos.x + '" y1="' + (pos.y + cardHeaderH) + '" x2="' + (pos.x + cardW) + '" y2="' + (pos.y + cardHeaderH) + '" stroke="#EEF0F4" stroke-width="1"/>';
    const chevX = pos.x + 14, chevY = pos.y + cardHeaderH / 2;
    if (isExpanded) svg += '<polygon points="' + (chevX-3) + ',' + (chevY-3) + ' ' + (chevX+3) + ',' + (chevY-3) + ' ' + chevX + ',' + (chevY+3) + '" fill="#6B7280"/>';
    else svg += '<polygon points="' + (chevX-3) + ',' + (chevY-4) + ' ' + (chevX+3) + ',' + chevY + ' ' + (chevX-3) + ',' + (chevY+4) + '" fill="#6B7280"/>';
    svg += '<text x="' + (pos.x + 28) + '" y="' + (pos.y + cardHeaderH/2 + 1) + '" dominant-baseline="middle" font-size="12" font-weight="600" fill="#1A1D29" font-family="system-ui">' + ct.name + '</text>';
    const badgeText = ct.entryCount + '';
    const badgeW = badgeText.length * 7 + 14;
    svg += '<rect x="' + (pos.x + cardW - badgeW - 10) + '" y="' + (pos.y + cardHeaderH/2 - 9) + '" width="' + badgeW + '" height="18" rx="9" fill="#EEF2FF"/>';
    svg += '<text x="' + (pos.x + cardW - badgeW/2 - 10) + '" y="' + (pos.y + cardHeaderH/2 + 1) + '" dominant-baseline="middle" text-anchor="middle" font-size="9.5" font-weight="600" fill="#4F46E5" font-family="system-ui">' + badgeText + '</text>';
    if (isExpanded && fields.length > 0) {
      fields.forEach((f, i) => {
        const fy = pos.y + cardHeaderH + i * fieldH + fieldH / 2;
        const isLink = f.type === 'Link' || (f.type === 'Array' && f.linkType === 'Entry');
        const dotColor = isLink ? '#4F46E5' : (typeColor[f.type] || '#94A3B8');
        svg += '<circle cx="' + (pos.x + 16) + '" cy="' + fy + '" r="3" fill="' + dotColor + '"/>';
        svg += '<text x="' + (pos.x + 26) + '" y="' + fy + '" dominant-baseline="middle" font-size="10.5" fill="' + (isLink ? '#4F46E5' : '#1A1D29') + '" font-weight="' + (isLink ? '600' : '400') + '" font-family="system-ui">' + f.id + '</text>';
        const shortType = f.type === 'Array' ? (f.linkType ? 'Array‹' + f.linkType + '›' : 'Array') : (f.linkType ? f.type + ':' + f.linkType : f.type);
        svg += '<text x="' + (pos.x + cardW - 10) + '" y="' + fy + '" dominant-baseline="middle" text-anchor="end" font-size="8.5" fill="#9CA3AF" font-family="system-ui">' + shortType + '</text>';
      });
    }
    const footerY = pos.y + h - cardFooterH;
    svg += '<line x1="' + pos.x + '" y1="' + footerY + '" x2="' + (pos.x + cardW) + '" y2="' + footerY + '" stroke="#EEF0F4" stroke-width="1"/>';
    svg += '<text x="' + (pos.x + 14) + '" y="' + (footerY + cardFooterH/2 + 1) + '" dominant-baseline="middle" font-size="9" fill="#9CA3AF" font-family="system-ui">' + fields.length + ' fields · ' + ctId + '</text>';
    svg += '<circle cx="' + (pos.x + cardW) + '" cy="' + (pos.y + cardHeaderH/2) + '" r="4" fill="white" stroke="#DDE0E8" stroke-width="1.5"/>';
    svg += '<circle cx="' + pos.x + '" cy="' + (pos.y + cardHeaderH/2) + '" r="4" fill="white" stroke="#DDE0E8" stroke-width="1.5"/>';
    svg += '</g>';
  }
  svg += '</svg>';
  canvas.innerHTML = svg;

  canvas.querySelectorAll('.ct-node').forEach(g => {
    const ctId = g.dataset.ct;
    g.addEventListener('click', (e) => { e.stopPropagation(); expanded[ctId] = !expanded[ctId]; render(); });
    g.addEventListener('dblclick', (e) => { e.stopPropagation(); showCtDetail(ctId); });
    g.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragNode = ctId;
      const svgRect = canvas.querySelector('svg').getBoundingClientRect();
      const mx = viewBox.x + (e.clientX - svgRect.left) / svgRect.width * (viewBox.w / scale);
      const my = viewBox.y + (e.clientY - svgRect.top) / svgRect.height * (viewBox.h / scale);
      dragOffset = { x: mx - positions[ctId].x, y: my - positions[ctId].y };
      e.preventDefault();
    });
  });
}

function getCardHeight(ctId) {
  const ct = DATA.contentTypes[ctId];
  const fields = ct?.fields || [];
  return expanded[ctId] ? cardHeaderH + fields.length * fieldH + cardFooterH : cardHeaderH + cardFooterH;
}

canvas.addEventListener('mousedown', (e) => {
  if (dragNode) return;
  panStart = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
});
document.addEventListener('mousemove', (e) => {
  if (dragNode) {
    const svgRect = canvas.querySelector('svg').getBoundingClientRect();
    const mx = viewBox.x + (e.clientX - svgRect.left) / svgRect.width * (viewBox.w / scale);
    const my = viewBox.y + (e.clientY - svgRect.top) / svgRect.height * (viewBox.h / scale);
    positions[dragNode] = { x: mx - dragOffset.x, y: my - dragOffset.y };
    render();
    return;
  }
  if (!panStart) return;
  const dx = (e.clientX - panStart.x) / scale;
  const dy = (e.clientY - panStart.y) / scale;
  viewBox.x = panStart.vx - dx;
  viewBox.y = panStart.vy - dy;
  render();
});
document.addEventListener('mouseup', () => { panStart = null; dragNode = null; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  scale = Math.max(0.3, Math.min(3, scale * factor));
  render();
}, { passive: false });
document.getElementById('zoomIn').onclick = () => { scale = Math.min(3, scale * 1.2); render(); };
document.getElementById('zoomOut').onclick = () => { scale = Math.max(0.3, scale * 0.8); render(); };
document.getElementById('zoomFit').onclick = () => { scale = 1; viewBox.x = 0; viewBox.y = 0; render(); };

function showCtDetail(ctId) {
  const ct = DATA.contentTypes[ctId];
  if (!ct) return;
  const entries = DATA.entries.filter(e => e.contentType === ctId);
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  const outRels = DATA.ctRelationships.filter(r => r.from === ctId);
  const inRels = DATA.ctRelationships.filter(r => r.to === ctId);
  content.innerHTML =
    '<h3>' + ct.name + '</h3>' +
    '<div class="dp-section"><h4>Identity</h4>' +
      '<div class="dp-row"><span class="k">id</span><span class="v">' + ct.id + '</span></div>' +
      '<div class="dp-row"><span class="k">entries</span><span class="v">' + ct.entryCount + '</span></div>' +
      '<div class="dp-row"><span class="k">displayField</span><span class="v">' + (ct.displayField || '—') + '</span></div>' +
    '</div>' +
    '<div class="dp-section"><h4>Fields (' + ct.fields.length + ')</h4>' +
      ct.fields.map(f => '<div class="dp-row"><span class="k">' + f.id + '</span><span class="v">' + f.type + (f.linkType ? ':'+f.linkType : '') + (f.required ? ' ✱' : '') + '</span></div>').join('') +
    '</div>' +
    (outRels.length ? '<div class="dp-section"><h4>References Out →</h4>' + outRels.map(r => '<div class="dp-row"><span class="k">' + r.fieldName + '</span><span class="v">→ ' + r.to + '</span></div>').join('') + '</div>' : '') +
    (inRels.length ? '<div class="dp-section"><h4>← Referenced By</h4>' + inRels.map(r => '<div class="dp-row"><span class="k">' + r.from + '</span><span class="v">.' + r.fieldName + '</span></div>').join('') + '</div>' : '') +
    '<div class="dp-section"><h4>Sample Entries (first 20)</h4>' +
      entries.slice(0, 20).map(e => '<div class="dp-row"><span class="k" style="font-size:0.65rem">' + e.id.substring(0, 45) + '</span><span class="v">' + e.locale + '</span></div>').join('') +
      (entries.length > 20 ? '<div style="color:#6B7280;font-size:0.7rem;padding:4px 0">+' + (entries.length - 20) + ' more</div>' : '') +
    '</div>';
  panel.classList.add('open');
}

// Sidebar: CT list
const ctList = document.getElementById('ct-list');
Object.entries(DATA.contentTypes).sort((a,b) => b[1].entryCount - a[1].entryCount).forEach(([ctId, ct]) => {
  const li = document.createElement('li');
  li.className = 'list-item';
  const hasWarnings = DATA.warnings.some(w => w.contentType === ctId);
  const dotColor = hasWarnings ? '#D97706' : '#059669';
  li.innerHTML = '<div class="title"><span class="dot" style="background:' + dotColor + '"></span>' + esc(ct.name) + '</div><div class="meta">' + esc(ctId) + ' · ' + ct.entryCount + ' entries · ' + ct.fields.length + ' fields</div>';
  li.onclick = () => showCtDetail(ctId);
  ctList.appendChild(li);
});

// Sidebar: Entry list
const entryList = document.getElementById('entry-list');
DATA.entries.forEach(e => {
  const li = document.createElement('li');
  li.className = 'list-item';
  li.innerHTML = '<div class="title" style="font-family:monospace;font-size:0.72rem;color:#818CF8">' + esc(e.id.substring(0, 55)) + '</div><div class="meta">' + esc(e.contentType) + ' · ' + esc(e.locale) + ' · ' + Object.keys(e.fields).length + ' fields</div>';
  entryList.appendChild(li);
});

// Sidebar: Issues
const issueList = document.getElementById('issue-list');
const warnGroups = {};
DATA.warnings.forEach(w => { if (!warnGroups[w.type]) warnGroups[w.type] = []; warnGroups[w.type].push(w); });
DATA.errors.forEach(e => {
  const li = document.createElement('li');
  li.className = 'issue-item error';
  li.innerHTML = '<div class="itype" style="color:#FCA5A5">❌ ' + esc(e.type) + '</div><div class="imsg">' + esc(e.contentType||'') + ' ' + esc(e.message||'') + '</div>';
  issueList.appendChild(li);
});
Object.entries(warnGroups).forEach(([type, items]) => {
  const li = document.createElement('li');
  li.className = 'issue-item warning';
  li.innerHTML = '<div class="itype" style="color:#FCD34D">⚠️ ' + esc(type) + ' (' + items.length + ')</div><div class="imsg">' + items.slice(0,3).map(w => esc((w.contentType||'') + (w.field ? '.' + w.field : ''))).join(', ') + (items.length > 3 ? ', …+' + (items.length-3) + ' more' : '') + '</div>';
  issueList.appendChild(li);
});

// Tabs
document.querySelectorAll('.tab-bar button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-bar button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  };
});
document.getElementById('ct-filter').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  ctList.querySelectorAll('.list-item').forEach(li => { li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none'; });
};
document.getElementById('entry-filter').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  entryList.querySelectorAll('.list-item').forEach(li => { li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none'; });
};

render();
`;
