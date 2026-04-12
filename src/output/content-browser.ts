/**
 * Content Model Simulator — Content Browser HTML Generator
 */

import type { SimulationReport, Entry } from '../types.js';

export function generateContentBrowserHTML(report: SimulationReport): string {
  const allEntries: Array<Record<string, any>> = [];

  // Component entries
  for (const e of report.entries) {
    allEntries.push({
      id: e.id,
      contentType: e.contentType,
      locale: e.locale,
      name: resolveDisplayName(e),
      fields: e.fields,
      linkedEntryIds: e.linkedEntryIds || [],
      linkedAssetIds: e.linkedAssetIds || [],
      sourceId: e.sourceId || null,
      sourcePath: e.sourcePath || null,
    });
  }

  // Page entry (if exists)
  const pe = report.pageEntry;
  if (pe) {
    const firstLocale = report.locales[0] || 'en';
    const allComponentIds = Object.values(pe.sections).flat();
    const fields = {
      internalName: { [firstLocale]: pe.id },
      title: { [firstLocale]: pe.title },
      slug: {} as Record<string, any>,
      sections: {} as Record<string, any>,
    };
    for (const loc of report.locales) {
      fields.slug[loc] = pe.slug;
      if (pe.sections[loc]) {
        fields.sections[loc] = pe.sections[loc].map(cid => ({
          sys: { type: 'Link', linkType: 'Entry', id: cid },
        }));
      }
    }
    allEntries.push({
      id: pe.id,
      contentType: 'page',
      locale: firstLocale,
      name: pe.title,
      fields,
      linkedEntryIds: allComponentIds,
      linkedAssetIds: [],
    });
  }

  const ctDefs = report.contentTypes;

  function resolveDisplayName(entry: Entry): string {
    const f = entry.fields;
    const loc = entry.locale || Object.keys(f?.internalName || {})[0] || 'en';
    return (f?.internalName?.[loc] || f?.title?.[loc] || f?.name?.[loc] || (f as any)?.lblTitle?.[loc] || entry.id) as string;
  }

  const browserData = {
    page: report.page,
    timestamp: report.timestamp,
    locales: report.locales,
    stats: report.stats,
    contentTypes: Object.fromEntries(
      Object.entries(ctDefs).map(([id, ct]) => [id, {
        id: ct.id,
        name: ct.name,
        displayField: ct.displayField,
        fields: (ct.fields || []).map(f => ({
          id: f.id, name: f.name, type: f.type, required: f.required,
          localized: f.localized, linkType: f.linkType || null,
          items: f.items || null,
        })),
      }])
    ),
    entries: allEntries.map(e => ({
      id: e.id,
      contentType: e.contentType,
      locale: e.locale,
      name: e.name,
      fields: e.fields,
      linkedEntryIds: e.linkedEntryIds,
      linkedAssetIds: e.linkedAssetIds,
      sourceId: e.sourceId || null,
      sourcePath: e.sourcePath || null,
    })),
  };

  const ctOptions = Object.keys(ctDefs).sort().map(ct =>
    `<option value="${ct}">${escapeHtml(ctDefs[ct].name || ct)}</option>`
  ).join('\n          ');

  const localeOptions = report.locales.map(l =>
    `<option value="${l}">${escapeHtml(l)}</option>`
  ).join('\n          ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Content Browser: ${escapeHtml(report.page)}</title>
<style>
${BROWSER_CSS}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <span class="logo">Content Model Simulator</span>
    <span class="sep">›</span>
    <span class="page-name">${escapeHtml(report.page)} · ${report.locales.length} locales · ${(report.stats.totalComponents || 0) + (pe ? 1 : 0)} entries</span>
  </div>
  <div class="topbar-right">
    <a href="visual-report.html">Content Model Graph</a>
  </div>
</div>

<div class="layout">
  <div class="list-panel">
    <div class="list-header">
      <h2>All content</h2>
      <div class="filter-row">
        <select class="filter-select" id="ct-filter">
          <option value="">Content type: Any</option>
          ${ctOptions}
        </select>
        <select class="filter-select" id="locale-filter">
          <option value="">Locale: All</option>
          ${localeOptions}
        </select>
        <input type="text" class="search-box" id="search-input" placeholder="Search entries...">
      </div>
      <div class="sort-row">
        <span class="entry-count" id="entry-count">${allEntries.length} entries</span>
      </div>
    </div>
    <div class="list-col-header">
      <span>Name</span>
      <span>Content Type</span>
      <span>Locale</span>
    </div>
    <div class="entry-list" id="entry-list"></div>
  </div>

  <div class="detail-panel" id="detail-panel">
    <div class="detail-empty" id="detail-empty">
      <div class="icon">📋</div>
      <p>Select an entry to view its fields</p>
    </div>
    <div id="detail-content" style="display:none"></div>
  </div>
</div>

<script>
const DATA = ${JSON.stringify(browserData, null, 0).replace(/<\//g, '<\\/')};
${BROWSER_JS}
</script>
</body>
</html>`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════
// Embedded CSS
// ═══════════════════════════════════════════════════════════════════
const BROWSER_CSS = `
:root {
  --blue: #0059C8; --blue-light: #E8F0FE; --blue-hover: #F5F8FF;
  --green: #36B37E; --green-bg: #E3FCEF; --green-text: #006644;
  --orange: #FF991F; --orange-bg: #FFFAE6; --orange-text: #FF8B00;
  --red: #DE350B; --gray-50: #FAFBFC; --gray-100: #F4F5F7; --gray-200: #EBECF0;
  --gray-300: #DFE1E6; --gray-400: #C1C7D0; --gray-500: #6B778C; --gray-600: #505F79;
  --gray-700: #344563; --gray-800: #172B4D; --white: #FFFFFF;
  --radius: 6px; --shadow-sm: 0 1px 3px rgba(0,0,0,0.08); --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--gray-50); color: var(--gray-800); min-height: 100vh; }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 56px; background: var(--white); border-bottom: 1px solid var(--gray-200); position: sticky; top: 0; z-index: 100; }
.topbar-left { display: flex; align-items: center; gap: 16px; }
.topbar-left .logo { font-weight: 700; font-size: 0.95rem; color: var(--blue); }
.topbar-left .sep { color: var(--gray-300); }
.topbar-left .page-name { font-size: 0.85rem; color: var(--gray-600); }
.topbar-right { display: flex; align-items: center; gap: 12px; }
.topbar-right a { font-size: 0.8rem; color: var(--blue); text-decoration: none; padding: 6px 12px; border: 1px solid var(--gray-300); border-radius: var(--radius); transition: all 0.15s; }
.topbar-right a:hover { background: var(--blue-light); border-color: var(--blue); }

.layout { display: flex; height: calc(100vh - 56px); }
.list-panel { width: 420px; min-width: 320px; max-width: 500px; background: var(--white); border-right: 1px solid var(--gray-200); display: flex; flex-direction: column; overflow: hidden; }
.detail-panel { flex: 1; overflow-y: auto; background: var(--gray-50); }

.list-header { padding: 20px 20px 0; }
.list-header h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 14px; }
.filter-row { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.filter-select { padding: 6px 10px; font-size: 0.78rem; border: 1px solid var(--gray-300); border-radius: var(--radius); background: var(--white); color: var(--gray-700); cursor: pointer; }
.filter-select.active { background-color: var(--blue); color: var(--white); border-color: var(--blue); }
.search-box { flex: 1; min-width: 140px; padding: 6px 10px 6px 30px; font-size: 0.78rem; border: 1px solid var(--gray-300); border-radius: var(--radius); outline: none; background: var(--white); transition: border-color 0.15s; }
.search-box:focus { border-color: var(--blue); }
.sort-row { display: flex; align-items: center; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--gray-200); }
.entry-count { font-size: 0.72rem; color: var(--gray-500); margin-left: auto; }

.entry-list { flex: 1; overflow-y: auto; }
.entry-row { display: flex; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--gray-100); cursor: pointer; transition: background 0.1s; gap: 8px; }
.entry-row:hover { background: var(--blue-hover); }
.entry-row.selected { background: var(--blue-light); }
.entry-row .e-name { flex: 1; font-size: 0.82rem; font-weight: 500; color: var(--gray-800); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-row .e-ct { flex-shrink: 0; font-size: 0.68rem; color: var(--gray-500); background: var(--gray-100); padding: 2px 8px; border-radius: 3px; white-space: nowrap; }
.entry-row .e-locale { flex-shrink: 0; font-size: 0.68rem; color: var(--gray-500); width: 42px; text-align: center; }

.list-col-header { display: flex; padding: 6px 16px; font-size: 0.68rem; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; border-bottom: 1px solid var(--gray-200); gap: 8px; background: var(--gray-50); position: sticky; top: 0; z-index: 2; }
.list-col-header span:first-child { flex: 1; }
.list-col-header span:not(:first-child) { flex-shrink: 0; text-align: center; }

.embed-items { display: flex; flex-direction: column; gap: 8px; }
.embed-card { background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius); overflow: hidden; transition: border-color 0.15s; }
.embed-card:hover { border-color: var(--blue); }
.embed-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); cursor: pointer; user-select: none; }
.embed-header .embed-title { font-size: 0.78rem; font-weight: 500; color: var(--gray-700); }
.embed-header .embed-idx { font-size: 0.65rem; color: var(--gray-400); background: var(--gray-200); padding: 1px 6px; border-radius: 3px; }
.embed-header .embed-toggle { font-size: 0.7rem; color: var(--gray-400); transition: transform 0.2s; }
.embed-card.open .embed-toggle { transform: rotate(90deg); }
.embed-body { display: none; padding: 0; }
.embed-card.open .embed-body { display: block; }
.embed-field { padding: 8px 12px; border-bottom: 1px solid var(--gray-100); }
.embed-field:last-child { border-bottom: none; }
.embed-field-name { font-size: 0.7rem; color: var(--gray-500); margin-bottom: 2px; }
.embed-field-val { font-size: 0.82rem; color: var(--gray-800); word-break: break-word; }
.embed-field-val.empty { color: var(--gray-400); font-style: italic; font-size: 0.78rem; }
.embed-field-val img.thumb { max-width: 120px; max-height: 80px; border-radius: 4px; border: 1px solid var(--gray-200); margin-top: 4px; }

.select-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; background: var(--blue-light); border: 1px solid #C7D7F5; border-radius: 14px; font-size: 0.78rem; color: var(--blue); font-weight: 500; }

.detail-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--gray-400); }
.detail-empty .icon { font-size: 3rem; margin-bottom: 12px; }
.detail-empty p { font-size: 0.9rem; }

.breadcrumb { display: flex; align-items: center; gap: 6px; padding: 16px 28px 0; font-size: 0.8rem; flex-wrap: wrap; }
.breadcrumb a { color: var(--blue); text-decoration: none; cursor: pointer; }
.breadcrumb a:hover { text-decoration: underline; }
.breadcrumb .sep { color: var(--gray-400); }
.breadcrumb .current { font-weight: 600; color: var(--gray-800); }

.entry-header { padding: 16px 28px 12px; border-bottom: 1px solid var(--gray-200); background: var(--white); }
.entry-header .ct-badge { font-size: 0.7rem; color: var(--gray-500); margin-bottom: 4px; }
.entry-header h2 { font-size: 1.15rem; font-weight: 600; margin-bottom: 6px; }
.entry-header .meta { display: flex; gap: 16px; font-size: 0.72rem; color: var(--gray-500); flex-wrap: wrap; }


.detail-tabs { display: flex; gap: 0; background: var(--white); border-bottom: 1px solid var(--gray-200); padding: 0 28px; }
.detail-tabs button { background: none; border: none; padding: 10px 16px; font-size: 0.82rem; color: var(--gray-500); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
.detail-tabs button:hover { color: var(--gray-700); }
.detail-tabs button.active { color: var(--blue); border-bottom-color: var(--blue); font-weight: 500; }

.fields-container { padding: 20px 28px 40px; }
.field-card { background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius); margin-bottom: 16px; overflow: hidden; }
.field-label { padding: 10px 16px 4px; font-size: 0.72rem; color: var(--gray-500); display: flex; align-items: center; gap: 6px; }
.field-label .req { color: var(--red); font-weight: 700; }
.field-label .ftype { margin-left: auto; font-size: 0.65rem; background: var(--gray-100); padding: 1px 6px; border-radius: 3px; color: var(--gray-500); }
.field-label .locale-tag { font-size: 0.65rem; color: var(--gray-400); font-style: italic; }
.field-value { padding: 4px 16px 12px; font-size: 0.88rem; color: var(--gray-800); min-height: 28px; word-break: break-word; }
.field-value.empty { color: var(--gray-400); font-style: italic; font-size: 0.82rem; }
.field-value code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; background: var(--gray-100); padding: 1px 4px; border-radius: 3px; }
.field-value .html-preview { background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 10px 12px; font-size: 0.82rem; line-height: 1.5; }

.linked-entry { display: flex; align-items: center; gap: 10px; padding: 8px 12px; margin: 4px 0; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius); cursor: pointer; transition: all 0.15s; }
.linked-entry:hover { border-color: var(--blue); background: var(--blue-hover); }
.linked-entry .le-ct { font-size: 0.68rem; color: var(--gray-500); background: var(--gray-100); padding: 2px 6px; border-radius: 3px; flex-shrink: 0; }
.linked-entry .le-name { font-size: 0.82rem; color: var(--gray-800); font-weight: 500; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.linked-entry .le-arrow { color: var(--gray-400); flex-shrink: 0; }

.asset-link { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius); font-size: 0.78rem; color: var(--gray-600); }
.asset-link .a-icon { font-size: 1rem; }

.refs-container { padding: 20px 28px 40px; }
.ref-section h3 { font-size: 0.82rem; font-weight: 600; color: var(--gray-600); margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--gray-200); }
.ref-section { margin-bottom: 24px; }

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--gray-300); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--gray-400); }

@media (max-width: 768px) {
  .layout { flex-direction: column; }
  .list-panel { width: 100%; max-width: 100%; height: 45vh; min-width: 0; }
  .detail-panel { height: 55vh; }
}
`;

// ═══════════════════════════════════════════════════════════════════
// Embedded JS
// ═══════════════════════════════════════════════════════════════════
const BROWSER_JS = `
const entryMap = {};
const sourceIdMap = {};
DATA.entries.forEach(e => {
  entryMap[e.id] = e;
  if (e.sourceId) sourceIdMap[e.sourceId] = e;
});

const listEl = document.getElementById('entry-list');
const countEl = document.getElementById('entry-count');
let selectedId = null;

function getDisplayName(entry) {
  const f = entry.fields;
  const loc = entry.locale || Object.keys(f?.internalName || {})[0] || 'en';
  return f?.internalName?.[loc] || f?.title?.[loc] || f?.name?.[loc] || f?.lblTitle?.[loc] || entry.id;
}

function renderList() {
  const ctFilter = document.getElementById('ct-filter').value;
  const locFilter = document.getElementById('locale-filter').value;
  const search = document.getElementById('search-input').value.toLowerCase();

  let filtered = DATA.entries;
  if (ctFilter) filtered = filtered.filter(e => e.contentType === ctFilter);
  if (locFilter) filtered = filtered.filter(e => e.locale === locFilter);
  if (search) filtered = filtered.filter(e => {
    const name = getDisplayName(e).toLowerCase();
    return name.includes(search) || e.id.toLowerCase().includes(search) || e.contentType.toLowerCase().includes(search);
  });

  listEl.innerHTML = '';
  countEl.textContent = filtered.length + ' entries';

  for (const entry of filtered) {
    const row = document.createElement('div');
    row.className = 'entry-row' + (entry.id === selectedId ? ' selected' : '');
    row.innerHTML =
      '<span class="e-name">' + esc(getDisplayName(entry)) + '</span>' +
      '<span class="e-ct">' + esc(entry.contentType) + '</span>' +
      '<span class="e-locale">' + esc(entry.locale) + '</span>';
    row.onclick = () => openEntry(entry.id);
    listEl.appendChild(row);
  }
}

const navStack = [];

function openEntry(entryId, pushToStack) {
  const entry = entryMap[entryId];
  if (!entry) return;

  selectedId = entryId;
  if (pushToStack !== false) navStack.push(entryId);

  listEl.querySelectorAll('.entry-row').forEach(r => r.classList.remove('selected'));
  const rows = listEl.querySelectorAll('.entry-row');
  rows.forEach(r => {
    if (r.querySelector('.e-name')?.textContent === getDisplayName(entry)) r.classList.add('selected');
  });

  document.getElementById('detail-empty').style.display = 'none';
  const detailEl = document.getElementById('detail-content');
  detailEl.style.display = 'block';

  const ctDef = DATA.contentTypes[entry.contentType];
  const ctName = ctDef?.name || entry.contentType;
  const entryName = getDisplayName(entry);
  const locale = entry.locale || 'en';

  let breadcrumbHtml = '<div class="breadcrumb">';
  if (navStack.length > 1) {
    for (let i = 0; i < navStack.length - 1; i++) {
      const pe = entryMap[navStack[i]];
      if (pe) {
        const pCtDef = DATA.contentTypes[pe.contentType];
        breadcrumbHtml += '<a onclick="goBack(' + i + ')">' + esc(pCtDef?.name || pe.contentType) + '</a><span class="sep">›</span>';
      }
    }
  }
  breadcrumbHtml += '<span class="current">' + esc(ctName) + ' / ' + esc(entryName) + '</span></div>';

  let headerHtml = '<div class="entry-header">' +
    '<div class="ct-badge">← ' + esc(ctName) + '</div>' +
    '<h2>' + esc(entryName) + '</h2>' +
    '<div class="meta">' +
      '<span>Locale: <strong>' + esc(locale) + '</strong></span>' +
      '<span>ID: <code>' + esc(entry.id) + '</code></span>' +
      (entry.sourcePath ? '<span>Source: <code>' + esc(entry.sourcePath) + '</code></span>' : '') +
    '</div></div>';

  let tabsHtml = '<div class="detail-tabs">' +
    '<button class="active" data-dtab="fields-tab">Editor</button>' +
    '<button data-dtab="refs-tab">References (' + (entry.linkedEntryIds?.length || 0) + ')</button>' +
    '</div>';

  let fieldsHtml = '<div class="fields-container" id="fields-tab">';
  const fieldDefs = ctDef?.fields || [];
  const fieldOrder = fieldDefs.length > 0 ? fieldDefs.map(f => f.id) : Object.keys(entry.fields);

  for (const fieldId of fieldOrder) {
    if (!entry.fields[fieldId]) continue;
    const fDef = fieldDefs.find(f => f.id === fieldId);
    const fName = fDef?.name || fieldId;
    const fType = fDef?.type || 'Unknown';
    const isRequired = fDef?.required || false;

    const fieldWrapper = entry.fields[fieldId];
    const localeKeys = Object.keys(fieldWrapper);

    for (const loc of localeKeys) {
      const val = fieldWrapper[loc];
      fieldsHtml += '<div class="field-card">';
      fieldsHtml += '<div class="field-label">';
      fieldsHtml += '<span>' + esc(fName) + '</span>';
      if (isRequired) fieldsHtml += '<span class="req">*</span>';
      if (localeKeys.length > 1) fieldsHtml += '<span class="locale-tag">| ' + esc(loc) + '</span>';
      fieldsHtml += '<span class="ftype">' + esc(fType) + '</span>';
      fieldsHtml += '</div>';
      fieldsHtml += renderFieldValue(val, fDef, loc);
      fieldsHtml += '</div>';
    }
  }
  fieldsHtml += '</div>';

  let refsHtml = '<div class="refs-container" id="refs-tab" style="display:none">';
  if (entry.linkedEntryIds?.length > 0) {
    refsHtml += '<div class="ref-section"><h3>Links to (' + entry.linkedEntryIds.length + ' entries)</h3>';
    for (const lid of entry.linkedEntryIds) refsHtml += renderLinkedEntry(lid);
    refsHtml += '</div>';
  }
  const incomingRefs = DATA.entries.filter(e => e.linkedEntryIds?.includes(entryId));
  if (incomingRefs.length > 0) {
    refsHtml += '<div class="ref-section"><h3>Referenced by (' + incomingRefs.length + ' entries)</h3>';
    for (const ref of incomingRefs) refsHtml += renderLinkedEntry(ref.id);
    refsHtml += '</div>';
  }
  if (!entry.linkedEntryIds?.length && !incomingRefs.length) {
    refsHtml += '<p style="color:var(--gray-400);font-size:0.85rem;padding:20px 0">No references found.</p>';
  }
  refsHtml += '</div>';

  detailEl.innerHTML = breadcrumbHtml + headerHtml + tabsHtml + fieldsHtml + refsHtml;

  detailEl.querySelectorAll('.detail-tabs button').forEach(btn => {
    btn.onclick = () => {
      detailEl.querySelectorAll('.detail-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.dtab;
      detailEl.querySelectorAll('.fields-container, .refs-container').forEach(t => t.style.display = 'none');
      document.getElementById(tabId).style.display = 'block';
    };
  });

  document.getElementById('detail-panel').scrollTop = 0;
}

function goBack(index) {
  navStack.length = index + 1;
  openEntry(navStack[index], false);
}

function renderFieldValue(val, fDef, locale) {
  if (val === null || val === undefined) return '<div class="field-value empty">Empty</div>';
  if (val?.sys?.linkType === 'Entry') return '<div class="field-value">' + renderLinkedEntry(val.sys.id) + '</div>';
  if (val?.sys?.linkType === 'Asset') return '<div class="field-value"><div class="asset-link"><span class="a-icon">🖼️</span> ' + esc(val.sys.id) + '</div></div>';

  if (Array.isArray(val)) {
    if (val.length === 0) return '<div class="field-value empty">Empty array</div>';
    if (val[0]?.sys?.linkType === 'Entry') {
      let html = '<div class="field-value">';
      for (const item of val) html += renderLinkedEntry(item.sys.id);
      return html + '</div>';
    }
    if (val[0]?.sys?.linkType === 'Asset') {
      let html = '<div class="field-value">';
      for (const item of val) html += '<div class="asset-link" style="margin:4px 0"><span class="a-icon">🖼️</span> ' + esc(item.sys.id) + '</div>';
      return html + '</div>';
    }
    if (typeof val[0] === 'string') return '<div class="field-value">' + val.map(v => '<code>' + esc(v) + '</code>').join(', ') + '</div>';
    if (typeof val[0] === 'number') return '<div class="field-value">' + val.map(v => '<code>' + v + '</code>').join(', ') + '</div>';
    if (typeof val[0] === 'object') return renderEmbeddedArray(val, fDef);
    return '<div class="field-value"><code>' + esc(JSON.stringify(val)) + '</code></div>';
  }

  if (typeof val === 'object' && val.nodeType === 'document') return renderRichText(val);
  if (typeof val === 'object') return renderObjectValue(val);
  if (typeof val === 'boolean') return '<div class="field-value">' + (val ? '<span style="color:#36B37E">✅ true</span>' : '<span style="color:#DE350B">❌ false</span>') + '</div>';
  if (typeof val === 'number') return '<div class="field-value"><strong>' + val + '</strong></div>';

  const str = String(val);
  if (str === '') return '<div class="field-value empty">Empty string</div>';
  if (/<[a-z][\\s>]/.test(str)) return '<div class="field-value"><div class="html-preview">' + esc(str) + '</div><div style="font-size:0.65rem;color:var(--gray-400);margin-top:4px">' + str.length + ' characters</div></div>';
  if (str.startsWith('http://') || str.startsWith('https://')) return '<div class="field-value"><a href="' + esc(str) + '" target="_blank" style="color:var(--blue);font-size:0.82rem;word-break:break-all">' + esc(str) + '</a></div>';
  const charInfo = str.length > 20 ? '<div style="font-size:0.65rem;color:var(--gray-400);margin-top:2px">' + str.length + ' characters</div>' : '';
  return '<div class="field-value">' + esc(str) + charInfo + '</div>';
}

function renderRichText(doc) {
  if (!doc || !doc.content) return '<div class="field-value empty">Empty RichText</div>';

  function renderNode(node) {
    if (!node) return '';
    if (node.nodeType === 'text') {
      let text = esc(node.value || '');
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') text = '<strong>' + text + '</strong>';
          else if (mark.type === 'italic') text = '<em>' + text + '</em>';
          else if (mark.type === 'underline') text = '<u>' + text + '</u>';
          else if (mark.type === 'code') text = '<code>' + text + '</code>';
        }
      }
      return text;
    }

    const children = (node.content || []).map(renderNode).join('');

    switch (node.nodeType) {
      case 'document': return children;
      case 'paragraph': return '<p style="margin:0 0 8px">' + (children || '&nbsp;') + '</p>';
      case 'heading-1': return '<h1 style="font-size:1.4rem;font-weight:700;margin:16px 0 8px">' + children + '</h1>';
      case 'heading-2': return '<h2 style="font-size:1.2rem;font-weight:600;margin:14px 0 6px">' + children + '</h2>';
      case 'heading-3': return '<h3 style="font-size:1.05rem;font-weight:600;margin:12px 0 6px">' + children + '</h3>';
      case 'heading-4': return '<h4 style="font-size:0.95rem;font-weight:600;margin:10px 0 4px">' + children + '</h4>';
      case 'heading-5': return '<h5 style="font-size:0.88rem;font-weight:600;margin:8px 0 4px">' + children + '</h5>';
      case 'heading-6': return '<h6 style="font-size:0.82rem;font-weight:600;margin:8px 0 4px">' + children + '</h6>';
      case 'unordered-list': return '<ul style="margin:0 0 8px;padding-left:20px">' + children + '</ul>';
      case 'ordered-list': return '<ol style="margin:0 0 8px;padding-left:20px">' + children + '</ol>';
      case 'list-item': return '<li style="margin:2px 0">' + children + '</li>';
      case 'blockquote': return '<blockquote style="border-left:3px solid var(--gray-300);padding:4px 12px;margin:8px 0;color:var(--gray-600)">' + children + '</blockquote>';
      case 'hr': return '<hr style="border:none;border-top:1px solid var(--gray-200);margin:12px 0">';
      case 'hyperlink': {
        const url = node.data?.uri || '#';
        return '<a href="' + esc(url) + '" target="_blank" style="color:var(--blue)">' + children + '</a>';
      }
      case 'embedded-entry-inline':
      case 'embedded-entry-block': {
        const entryId = node.data?.target?.sys?.id;
        if (entryId) return '<div style="margin:6px 0">' + renderLinkedEntry(entryId) + '</div>';
        return '<div style="color:var(--gray-400);font-style:italic;margin:4px 0">[Embedded entry]</div>';
      }
      case 'embedded-asset-block': {
        const assetId = node.data?.target?.sys?.id;
        return '<div style="margin:6px 0"><div class="asset-link"><span class="a-icon">🖼️</span> ' + esc(assetId || 'unknown') + '</div></div>';
      }
      case 'table': return '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:0.82rem">' + children + '</table>';
      case 'table-row': return '<tr>' + children + '</tr>';
      case 'table-cell': return '<td style="border:1px solid var(--gray-200);padding:6px 8px">' + children + '</td>';
      case 'table-header-cell': return '<th style="border:1px solid var(--gray-200);padding:6px 8px;background:var(--gray-50);font-weight:600;text-align:left">' + children + '</th>';
      default: return children;
    }
  }

  const html = renderNode(doc);
  const nodeCount = JSON.stringify(doc).length;
  return '<div class="field-value"><div class="html-preview" style="max-height:400px;overflow-y:auto">' + html +
    '</div><div style="font-size:0.65rem;color:var(--gray-400);margin-top:4px">RichText · ' +
    (doc.content?.length || 0) + ' top-level nodes</div></div>';
}

function renderObjectValue(obj) {
  if (!obj || typeof obj !== 'object') return '<div class="field-value empty">null</div>';
  const keys = Object.keys(obj);

  // Image resource
  if (obj.links?.resource?.href) {
    const resourceUrl = obj.links.resource.href;
    return '<div class="field-value"><div class="asset-link"><span class="a-icon">🖼️</span> <a href="' + esc(resourceUrl) + '" target="_blank" style="color:var(--blue);font-size:0.78rem">' + esc(obj.name || resourceUrl.split('/').pop()) + '</a></div></div>';
  }

  // Select/enum
  if (keys.length <= 4 && keys.every(k => typeof obj[k] === 'string' || typeof obj[k] === 'number' || obj[k] === null)) {
    const badges = keys.map(k => {
      if (obj[k] === null) return '<span class="select-badge" style="opacity:0.5">' + esc(k) + ': null</span>';
      return '<span class="select-badge">' + esc(String(obj[k])) + '</span>';
    });
    return '<div class="field-value">' + badges.join(' ') + '</div>';
  }

  // Generic object
  let html = '<div class="field-value"><div style="display:flex;flex-direction:column;gap:4px;padding:8px 12px;background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius)">';
  for (const k of keys) {
    const v = obj[k];
    let display;
    if (v === null || v === undefined) display = '<span style="color:var(--gray-400);font-style:italic">null</span>';
    else if (typeof v === 'string') display = v.length > 100 ? esc(v.substring(0,100)) + '…' : esc(v);
    else if (typeof v === 'boolean') display = v ? '✅' : '❌';
    else if (typeof v === 'number') display = '<strong>' + v + '</strong>';
    else if (typeof v === 'object') display = '<code style="font-size:0.72rem">' + esc(JSON.stringify(v).substring(0,80)) + (JSON.stringify(v).length > 80 ? '…' : '') + '</code>';
    else display = esc(String(v));
    html += '<div style="display:flex;gap:8px;align-items:baseline"><span style="font-size:0.7rem;color:var(--gray-500);min-width:100px;flex-shrink:0">' + esc(k) + '</span><span style="font-size:0.82rem">' + display + '</span></div>';
  }
  return html + '</div></div>';
}

function renderEmbeddedArray(arr, fDef) {
  let html = '<div class="field-value"><div class="embed-items">';
  let idx = 0;
  for (const item of arr) {
    idx++;
    const itemKeys = Object.keys(item);
    const cardTitle = item.lblTitle || item.name || item.title || item.internalName ||
      itemKeys.slice(0,2).map(k => typeof item[k] === 'string' ? item[k].substring(0,30) : '').filter(Boolean).join(' · ') || 'Item';
    const truncTitle = cardTitle.length > 60 ? cardTitle.substring(0,60) + '…' : cardTitle;

    html += '<div class="embed-card" onclick="this.classList.toggle(\\'open\\')">';
    html += '<div class="embed-header"><span class="embed-title">' + esc(truncTitle) + '</span><span class="embed-idx">' + idx + '/' + arr.length + '</span><span class="embed-toggle">›</span></div>';
    html += '<div class="embed-body">';

    for (const k of itemKeys) {
      const v = item[k];
      html += '<div class="embed-field"><div class="embed-field-name">' + esc(k) + '</div>';
      if (v === null || v === undefined) html += '<div class="embed-field-val empty">null</div>';
      else if (typeof v === 'boolean') html += '<div class="embed-field-val">' + (v ? '✅ true' : '❌ false') + '</div>';
      else if (typeof v === 'number') html += '<div class="embed-field-val"><strong>' + v + '</strong></div>';
      else if (typeof v === 'string') {
        if (v === '') html += '<div class="embed-field-val empty">empty</div>';
        else if (v.startsWith('http')) html += '<div class="embed-field-val"><a href="' + esc(v) + '" target="_blank" style="color:var(--blue);word-break:break-all;font-size:0.8rem">' + esc(v) + '</a></div>';
        else html += '<div class="embed-field-val">' + esc(v) + '</div>';
      } else if (v?.sys?.linkType === 'Entry') html += '<div class="embed-field-val">' + renderLinkedEntry(v.sys.id) + '</div>';
      else if (v?.sys?.linkType === 'Asset') html += '<div class="embed-field-val"><div class="asset-link"><span class="a-icon">🖼️</span> ' + esc(v.sys.id) + '</div></div>';
      else if (typeof v === 'object' && !Array.isArray(v)) {
        const oKeys = Object.keys(v);
        if (oKeys.length <= 3 && oKeys.every(ok => typeof v[ok] === 'string' || v[ok] === null)) {
          html += '<div class="embed-field-val">' + oKeys.map(ok => '<span class="select-badge">' + esc(String(v[ok] ?? ok)) + '</span>').join(' ') + '</div>';
        } else {
          html += '<div class="embed-field-val"><pre style="font-size:0.72rem;background:var(--gray-50);padding:6px;border-radius:4px;border:1px solid var(--gray-200);overflow-x:auto;max-height:150px">' + esc(JSON.stringify(v, null, 2)) + '</pre></div>';
        }
      } else if (Array.isArray(v)) {
        if (v.length === 0) html += '<div class="embed-field-val empty">[]</div>';
        else if (typeof v[0] === 'string') html += '<div class="embed-field-val">' + v.map(s => '<code>' + esc(s) + '</code>').join(', ') + '</div>';
        else html += '<div class="embed-field-val"><pre style="font-size:0.72rem;background:var(--gray-50);padding:6px;border-radius:4px;border:1px solid var(--gray-200);overflow-x:auto;max-height:150px">' + esc(JSON.stringify(v, null, 2)) + '</pre></div>';
      } else html += '<div class="embed-field-val">' + esc(String(v)) + '</div>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  return html + '</div></div>';
}

function renderLinkedEntry(entryId) {
  const linked = entryMap[entryId] || sourceIdMap[entryId];
  if (!linked) {
    return '<div class="linked-entry" style="opacity:0.5"><span class="le-ct">?</span><span class="le-name">' + esc(entryId) + '</span><span style="font-size:0.65rem;color:var(--gray-400)">Not in simulation</span></div>';
  }
  const ctDef = DATA.contentTypes[linked.contentType];
  return '<div class="linked-entry" onclick="openEntry(\\'' + linked.id + '\\')"><span class="le-ct">' + esc(ctDef?.name || linked.contentType) + '</span><span class="le-name">' + esc(getDisplayName(linked)) + '</span><span class="le-arrow">›</span></div>';
}

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

document.getElementById('ct-filter').onchange = function() {
  this.classList.toggle('active', this.value !== '');
  renderList();
};
document.getElementById('locale-filter').onchange = function() {
  this.classList.toggle('active', this.value !== '');
  renderList();
};
document.getElementById('search-input').oninput = renderList;

renderList();

const pageEntry = DATA.entries.find(e => e.contentType === 'page');
if (pageEntry) openEntry(pageEntry.id);
`;
