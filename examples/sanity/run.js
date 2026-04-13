/**
 * Sanity → Contentful Simulation (Programmatic Example)
 *
 * Reads a Sanity NDJSON export, applies transforms, and simulates
 * how the content would look in Contentful.
 *
 * Usage:
 *   node examples/sanity/run.js
 *
 * Or via CLI:
 *   npx cms-sim \
 *     --schemas=examples/sanity/schemas/ \
 *     --input=examples/sanity/data/sample-export.ndjson \
 *     --transforms=examples/sanity/transforms/ \
 *     --open
 */

import { readSanity, simulate, writeReport, SchemaRegistry, TransformerRegistry } from '../../dist/index.js';
import { register } from './transforms/sanity.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Read Sanity NDJSON export
//    readSanity() auto-filters drafts, system types, and image assets.
//    It normalizes: slug→string, Portable Text→HTML, localeString→{en:..., es:...}
const documents = readSanity(resolve(__dirname, 'data/sample-export.ndjson'));
console.log(`Read ${documents.length} documents from Sanity export`);
console.log('Content types found:', [...new Set(documents.map(d => d.contentType))].join(', '));

// 2. Load Contentful schemas
const schemas = new SchemaRegistry();
await schemas.loadFromDirectory(resolve(__dirname, 'schemas'));
console.log(`Loaded ${schemas.size} schemas: ${schemas.getAllIds().join(', ')}`);

// 3. Register transforms
const transformers = new TransformerRegistry();
register(transformers);

// 4. Simulate — generates Contentful-compatible entries + Content Browser
const report = simulate({
  documents,
  schemas,
  transformers,
  options: { name: 'sanity-migration', locales: ['en', 'es'] },
});

// 5. Write output files
const outDir = resolve(__dirname, 'output');
writeReport(report, outDir);

// 6. Report results
console.log('\n── Simulation Report ──');
console.log(`Total entries: ${report.stats.totalEntries}`);
console.log(`Content types: ${Object.keys(report.stats.entriesByType || {}).length}`);
console.log(`  by type:`, report.stats.entriesByType);
console.log(`Errors: ${report.errors.length}`);
console.log(`Warnings: ${report.warnings.length}`);

if (report.warnings.length > 0) {
  console.log('\nWarnings by type:');
  const grouped = {};
  for (const w of report.warnings) {
    grouped[w.type] = (grouped[w.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(grouped)) {
    console.log(`  ${type}: ${count}`);
  }
}

if (report.errors.length > 0) {
  console.log('\nErrors:');
  for (const e of report.errors) {
    console.log(`  [${e.type}] ${e.message}`);
  }
}

console.log('\nDone! Check the output/ directory for:');
console.log('  • content-browser.html  — Interactive preview (open in browser)');
console.log('  • visual-report.html    — Content model graph');
console.log('  • entries/              — Generated Contentful entries (JSON)');
console.log('  • content-types/        — Content type definitions (JSON)');
