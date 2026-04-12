/**
 * WordPress → Contentful Simulation (Programmatic Example)
 *
 * Reads a WordPress WXR export, applies transforms, and simulates
 * how the content would look in Contentful.
 *
 * Usage:
 *   node examples/wordpress/run.js
 *
 * Or via CLI:
 *   npx cms-sim \
 *     --schemas=examples/wordpress/schemas/ \
 *     --input=examples/wordpress/data/gutenberg-test-data.xml \
 *     --transforms=examples/wordpress/transforms/ \
 *     --open
 */

import { readWXR, simulate, SchemaRegistry, TransformerRegistry } from '../../dist/index.js';
import { register } from './transforms/wordpress.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 1. Read WordPress export
const documents = readWXR(resolve(__dirname, 'data/gutenberg-test-data.xml'));
console.log(`Read ${documents.length} documents from WXR export`);
console.log('Content types:', [...new Set(documents.map(d => d.contentType))].join(', '));

// 2. Load schemas
const schemas = new SchemaRegistry();
await schemas.loadFromDirectory(resolve(__dirname, 'schemas'));
console.log(`Loaded ${schemas.size} schemas: ${schemas.getAllIds().join(', ')}`);

// 3. Register transforms
const transformers = new TransformerRegistry();
register(transformers);

// 4. Simulate
const report = simulate({
  documents,
  schemas,
  transformers,
  options: { name: 'wordpress-migration' },
});

console.log('\n── Simulation Report ──');
console.log(`Total entries: ${report.stats.totalEntries}`);
console.log(`Content types: ${Object.keys(report.stats.entriesByType || {}).length}`);
console.log(`  by type:`, report.stats.entriesByType);
console.log(`Errors: ${report.errors.length}`);
console.log(`Warnings: ${report.warnings.length}`);

if (report.warnings.length > 0) {
  console.log('\nWarnings:');
  const grouped = {};
  for (const w of report.warnings) {
    grouped[w.type] = (grouped[w.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(grouped)) {
    console.log(`  ${type}: ${count}`);
  }
}

console.log('\nStats:', JSON.stringify(report.stats, null, 2));
