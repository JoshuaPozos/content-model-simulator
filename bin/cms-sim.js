#!/usr/bin/env node

/**
 * content-model-simulator CLI
 *
 * Usage:
 *   cms-sim --input <path> --schemas <dir> [options]
 *   cms-sim --help
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { exec } from 'node:child_process';

import { readDocuments } from '../src/core/reader.js';
import { SchemaRegistry } from '../src/core/schema-registry.js';
import { TransformerRegistry } from '../src/transform/transformer.js';
import { simulate } from '../src/core/simulator.js';
import { generateContentBrowserHTML } from '../src/output/content-browser.js';
import { generateModelGraphHTML } from '../src/output/model-graph.js';
import { writeReport } from '../src/output/json-writer.js';

// ── Terminal colours ─────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};

// ── Arg parsing ──────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    input: null,
    schemas: null,
    transforms: null,
    config: null,
    output: null,
    name: null,
    baseLocale: 'en',
    localeMap: null,
    format: 'ndjson',
    open: false,
    verbose: false,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg === '--open') { args.open = true; continue; }
    if (arg === '--json') { args.json = true; continue; }

    const eq = arg.indexOf('=');
    if (eq === -1) continue;
    const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
    const val = arg.substring(eq + 1);

    switch (key) {
      case 'input': args.input = val; break;
      case 'schemas': args.schemas = val; break;
      case 'transforms': args.transforms = val; break;
      case 'config': args.config = val; break;
      case 'output': args.output = val; break;
      case 'name': args.name = val; break;
      case 'base-locale': args.baseLocale = val; break;
      case 'locale-map': args.localeMap = val; break;
      case 'format': args.format = val; break;
    }
  }
  return args;
}

function showHelp() {
  console.log(`
${c.bold}Content Model Simulator${c.reset}
Simulate content model migrations locally — zero API calls.

${c.cyan}USAGE:${c.reset}
  cms-sim --input=<path> --schemas=<dir> [options]

${c.cyan}REQUIRED:${c.reset}
  --input=<path>        Source data file or directory
                        Supports: .ndjson, .json, directory of .json files
  --schemas=<dir>       Directory containing content type definitions
                        Supports: .js, .mjs, .json files

${c.cyan}OPTIONS:${c.reset}
  --transforms=<dir>    Directory with custom transformer modules
  --config=<file>       Configuration file (JSON) with locale-map, options, etc.
  --output=<dir>        Custom output directory (default: ./output/<name>_<timestamp>)
  --name=<string>       Project / page name (default: derived from input)
  --base-locale=<code>  Base locale code (default: en)
  --locale-map=<file>   JSON file mapping source locale keys → target locale codes
  --format=<fmt>        Input format: ndjson, json, dir (default: auto-detect)
  --json                Write JSON output only (skip HTML)
  --open                Auto-open HTML report in browser
  --verbose, -v         Verbose logging
  --help, -h            Show this help

${c.cyan}EXAMPLES:${c.reset}
  cms-sim --input=data/export.ndjson --schemas=schemas/
  cms-sim --input=data/ --schemas=schemas/ --name=homepage --open
  cms-sim --input=data/export.json --schemas=schemas/ --output=out/test-1
  cms-sim --input=data/ --schemas=schemas/ --config=cms-sim.config.json
`);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { showHelp(); process.exit(0); }

  if (!args.input) {
    console.error(`${c.red}Error: --input is required${c.reset}`);
    showHelp();
    process.exit(1);
  }
  if (!args.schemas) {
    console.error(`${c.red}Error: --schemas is required${c.reset}`);
    showHelp();
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  const schemasPath = resolve(args.schemas);

  if (!existsSync(inputPath)) {
    console.error(`${c.red}Error: Input not found: ${inputPath}${c.reset}`);
    process.exit(1);
  }
  if (!existsSync(schemasPath)) {
    console.error(`${c.red}Error: Schemas directory not found: ${schemasPath}${c.reset}`);
    process.exit(1);
  }

  // Load config if provided
  let config = {};
  if (args.config) {
    const configPath = resolve(args.config);
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    } else {
      console.error(`${c.red}Error: Config file not found: ${configPath}${c.reset}`);
      process.exit(1);
    }
  }

  // Header
  const projectName = args.name || config.name || basename(inputPath, extname(inputPath));
  console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Content Model Simulator: ${projectName}${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);
  console.log(`${c.dim}Local mode — 0 API calls${c.reset}\n`);

  // ── Step 1: Read documents ──────────────────────────────────
  if (args.verbose) console.log(`${c.dim}Reading documents from ${inputPath}...${c.reset}`);
  const documents = await readDocuments(inputPath, { format: args.format });
  console.log(`${c.green}✓${c.reset} Loaded ${c.bold}${documents.length}${c.reset} documents\n`);

  if (documents.length === 0) {
    console.log(`${c.yellow}⚠ No documents found. Check your input path.${c.reset}`);
    process.exit(0);
  }

  // ── Step 2: Load schemas ────────────────────────────────────
  const schemas = new SchemaRegistry();
  await schemas.loadFromDirectory(schemasPath);
  console.log(`${c.green}✓${c.reset} Loaded ${c.bold}${schemas.size}${c.reset} content type definitions\n`);

  // ── Step 3: Load custom transformers ────────────────────────
  const transformers = new TransformerRegistry();
  if (args.transforms) {
    const transformsPath = resolve(args.transforms);
    if (existsSync(transformsPath)) {
      // Dynamic import each .js/.mjs file in the transforms directory
      const { readdirSync } = await import('node:fs');
      const files = readdirSync(transformsPath).filter(f => /\.(js|mjs)$/.test(f));
      for (const file of files) {
        const mod = await import(join(transformsPath, file));
        if (typeof mod.register === 'function') {
          mod.register(transformers);
        }
      }
      if (args.verbose) console.log(`${c.dim}Loaded ${files.length} transformer module(s)${c.reset}\n`);
    }
  }

  // ── Step 4: Locale map ──────────────────────────────────────
  let localeMap = config.localeMap || null;
  if (args.localeMap) {
    const mapPath = resolve(args.localeMap);
    if (existsSync(mapPath)) {
      localeMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
    }
  }

  // ── Step 5: Simulate ───────────────────────────────────────
  console.log(`${c.cyan}Running simulation...${c.reset}\n`);

  const report = simulate({
    documents,
    schemas,
    transformers,
    options: {
      name: projectName,
      baseLocale: args.baseLocale || config.baseLocale || 'en',
      locales: config.locales || null,
      localeMap,
      fieldGroupMap: config.fieldGroupMap || null,
      isAsset: config.isAsset ? new Function('return ' + config.isAsset)() : undefined,
      getAssetUrl: config.getAssetUrl ? new Function('return ' + config.getAssetUrl)() : undefined,
      verbose: args.verbose,
    },
  });

  // ── Results summary ────────────────────────────────────────
  console.log(`${c.bold}Results:${c.reset}`);
  console.log(`  Content Types: ${c.green}${report.stats.totalCTs}${c.reset}`);
  console.log(`  Entries:       ${c.green}${report.stats.totalComponents}${c.reset}`);
  console.log(`  Assets:        ${c.green}${report.stats.totalAssets}${c.reset}`);
  console.log(`  Locales:       ${c.green}${report.stats.totalLocales}${c.reset}`);
  if (report.stats.totalErrors > 0)
    console.log(`  Errors:        ${c.red}${report.stats.totalErrors}${c.reset}`);
  if (report.stats.totalWarnings > 0)
    console.log(`  Warnings:      ${c.yellow}${report.stats.totalWarnings}${c.reset}`);

  // Print errors
  if (report.errors.length > 0) {
    console.log(`\n${c.red}${c.bold}Errors:${c.reset}`);
    for (const e of report.errors) {
      console.log(`  ${c.red}• ${e.type}${c.reset} ${e.contentType || ''} ${e.message || ''}`);
    }
  }

  // Print grouped warnings
  if (report.warnings.length > 0) {
    console.log(`\n${c.yellow}${c.bold}Warnings (top ${Math.min(10, report.warnings.length)}):${c.reset}`);
    const grouped = {};
    for (const w of report.warnings) {
      if (!grouped[w.type]) grouped[w.type] = [];
      grouped[w.type].push(w);
    }
    for (const [type, items] of Object.entries(grouped)) {
      console.log(`  ${c.yellow}${type}${c.reset}: ${items.length} occurrence(s)`);
      if (args.verbose) {
        for (const w of items.slice(0, 5)) {
          console.log(`    ${c.dim}${w.contentType || ''}${w.field ? '.' + w.field : ''} → ${w.entryId || ''}${c.reset}`);
        }
        if (items.length > 5) console.log(`    ${c.dim}...and ${items.length - 5} more${c.reset}`);
      }
    }
  }

  // ── Step 6: Write output ────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const outputDir = args.output
    ? resolve(args.output)
    : resolve('output', `${projectName.replace(/[^a-zA-Z0-9_-]/g, '-')}_${timestamp}`);

  // JSON output
  const { filesWritten } = writeReport(report, outputDir);

  // HTML output (unless --json)
  let browserPath, graphPath;
  if (!args.json) {
    browserPath = join(outputDir, 'content-browser.html');
    graphPath = join(outputDir, 'visual-report.html');
    writeFileSync(browserPath, generateContentBrowserHTML(report), 'utf-8');
    writeFileSync(graphPath, generateModelGraphHTML(report), 'utf-8');
  }

  console.log(`\n${c.cyan}${'─'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Output:${c.reset} ${outputDir}`);
  console.log(`${c.dim}  content-types/  → ${Object.keys(report.contentTypes).length} definitions${c.reset}`);
  console.log(`${c.dim}  entries/        → by content type${c.reset}`);
  console.log(`${c.dim}  manifest.json   → summary${c.reset}`);
  console.log(`${c.dim}  validation-report.json → errors & warnings${c.reset}`);
  if (!args.json) {
    console.log(`${c.green}${c.bold}  visual-report.html → interactive graph${c.reset}`);
    console.log(`${c.green}${c.bold}  content-browser.html → entry browser${c.reset}`);
  }
  console.log(`${c.dim}  ${filesWritten + (args.json ? 0 : 2)} files written${c.reset}`);

  // Auto-open
  if (args.open && browserPath) {
    const cmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    exec(`${cmd} "${browserPath}"`);
    console.log(`\n${c.cyan}Opening content browser...${c.reset}`);
  }

  console.log('');
}

main().catch(err => {
  console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
