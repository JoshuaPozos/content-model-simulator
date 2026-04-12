#!/usr/bin/env node

/**
 * content-model-simulator CLI
 *
 * Usage:
 *   cms-sim --schemas <dir> [options]        Simulate locally
 *   cms-sim pull --space-id=XXX [options]    Download from Contentful
 *   cms-sim --help
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { execFile } from 'node:child_process';

import { readDocuments } from '../dist/core/reader.js';
import { SchemaRegistry } from '../dist/core/schema-registry.js';
import { TransformerRegistry } from '../dist/transform/transformer.js';
import { simulate } from '../dist/core/simulator.js';
import { generateMockData } from '../dist/core/mock-generator.js';
import { generateContentBrowserHTML } from '../dist/output/content-browser.js';
import { generateModelGraphHTML } from '../dist/output/model-graph.js';
import { writeReport } from '../dist/output/json-writer.js';

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
    locales: null,
    localeMap: null,
    entriesPerType: null,
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
      case 'locales': args.locales = val; break;
      case 'locale-map': args.localeMap = val; break;
      case 'entries-per-type': args.entriesPerType = parseInt(val, 10) || null; break;
      case 'format': args.format = val; break;
    }
  }
  return args;
}

function showHelp() {
  console.log(`
${c.bold}Content Model Simulator${c.reset}
Preview your Contentful content model locally — never connects to Contentful during simulation.
Runs 100% offline. Does not upload or migrate anything.

${c.cyan}COMMANDS:${c.reset}
  cms-sim [options]              ${c.dim}Run local simulation (default)${c.reset}
  cms-sim pull [options]         ${c.dim}Download content model from Contentful${c.reset}

${c.cyan}SIMULATE — USAGE:${c.reset}
  cms-sim --schemas=<dir> [options]                  ${c.dim}Preview content model${c.reset}
  cms-sim --schemas=<dir> --input=<path> [options]   ${c.dim}Preview migration locally${c.reset}

${c.cyan}REQUIRED:${c.reset}
  --schemas=<dir>       Directory containing Contentful content type definitions
                        Supports: .js, .mjs, .json files

${c.cyan}DATA SOURCE (optional):${c.reset}
  --input=<path>        Source data file or directory
                        Supports: .ndjson, .json, directory of .json files
                        ${c.dim}If omitted, mock entries are auto-generated from schemas${c.reset}

${c.cyan}OPTIONS:${c.reset}
  --transforms=<dir>    Directory with custom transformer modules
  --config=<file>       Configuration file (JSON)
  --output=<dir>        Custom output directory (default: ./output/<name>_<timestamp>)
  --name=<string>       Project name (default: derived from input or schemas dir)
  --base-locale=<code>  Base locale code (default: en)
  --locales=<list>      Comma-separated locale codes (default: base locale only)
  --locale-map=<file>   JSON file mapping source → target locale codes
  --entries-per-type=<n> Mock entries per content type (default: 3, only without --input)
  --format=<fmt>        Input format: ndjson, json, dir (default: auto-detect)
  --json                Write JSON output only (skip HTML)
  --open                Auto-open HTML report in browser
  --verbose, -v         Verbose logging
  --help, -h            Show this help

${c.cyan}EXAMPLES:${c.reset}
  ${c.dim}# Preview content model (no data needed)${c.reset}
  cms-sim --schemas=schemas/ --open

  ${c.dim}# Preview migration with real data${c.reset}
  cms-sim --schemas=schemas/ --input=data/export.ndjson --open

  ${c.dim}# Download from Contentful, then simulate${c.reset}
  cms-sim pull --space-id=abc123 --output=my-project/
  cms-sim --schemas=my-project/schemas/ --open

Run ${c.bold}cms-sim pull --help${c.reset} for pull-specific options.
`);
}

function showPullHelp() {
  console.log(`
${c.bold}Content Model Simulator — Pull${c.reset}
Download your current content model (and optionally entries) from Contentful.
This is the ${c.bold}only${c.reset} command that connects to Contentful — it's read-only.

${c.cyan}USAGE:${c.reset}
  cms-sim pull --space-id=<id> --access-token=<token> [options]

${c.cyan}REQUIRED:${c.reset}
  --space-id=<id>       Contentful space ID
  --access-token=<tok>  CDA access token (read-only)
                        ${c.dim}Or set CONTENTFUL_SPACE_ID / CONTENTFUL_ACCESS_TOKEN env vars${c.reset}

${c.cyan}OPTIONS:${c.reset}
  --environment=<env>   Environment (default: master)
  --output=<dir>        Output directory (default: ./contentful-export)
  --include-entries     Also download published entries
  --max-entries=<n>     Max entries to download (default: 1000)
  --verbose, -v         Verbose logging
  --help, -h            Show this help

${c.cyan}OUTPUT:${c.reset}
  <output>/
    schemas/              ${c.dim}One .js file per content type (ready for cms-sim)${c.reset}
    contentful-space.json ${c.dim}Space metadata (locales, base locale, pulled date)${c.reset}
    data/entries.ndjson   ${c.dim}Entries in NDJSON (only with --include-entries)${c.reset}

${c.cyan}EXAMPLES:${c.reset}
  ${c.dim}# Download content model only${c.reset}
  cms-sim pull --space-id=abc123 --access-token=CDATOKEN --output=my-project/

  ${c.dim}# Download model + entries, then simulate${c.reset}
  cms-sim pull --space-id=abc123 --access-token=CDATOKEN --include-entries --output=my-project/
  cms-sim --schemas=my-project/schemas/ --input=my-project/data/entries.ndjson --open

  ${c.dim}# Using env vars${c.reset}
  export CONTENTFUL_SPACE_ID=abc123
  export CONTENTFUL_ACCESS_TOKEN=CDATOKEN
  cms-sim pull --output=my-project/

${c.yellow}Note:${c.reset} Your access token is never stored or logged. Use a CDA (read-only) token.
`);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { showHelp(); process.exit(0); }

  if (!args.schemas) {
    console.error(`${c.red}Error: --schemas is required${c.reset}`);
    showHelp();
    process.exit(1);
  }

  const schemasPath = resolve(args.schemas);
  const inputPath = args.input ? resolve(args.input) : null;
  const isMockMode = !inputPath;

  if (inputPath && !existsSync(inputPath)) {
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
  const projectName = args.name || config.name
    || (inputPath ? basename(inputPath, extname(inputPath)) : basename(schemasPath));
  console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Content Model Simulator: ${projectName}${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);
  console.log(`${c.dim}Local mode — 0 API calls${c.reset}`);
  if (isMockMode) console.log(`${c.dim}Mock mode — generating sample entries from schemas${c.reset}`);
  console.log('');

  // ── Step 1: Load schemas ────────────────────────────────────
  const schemas = new SchemaRegistry();
  await schemas.loadFromDirectory(schemasPath);
  console.log(`${c.green}✓${c.reset} Loaded ${c.bold}${schemas.size}${c.reset} content type definitions\n`);

  // ── Step 2: Read or generate documents ──────────────────────
  let documents;
  let mockAssets = undefined;
  const baseLocale = args.baseLocale || config.baseLocale || 'en';
  const locales = args.locales
    ? args.locales.split(',').map(l => l.trim())
    : (config.locales || null); // null = let simulator auto-detect from data

  if (inputPath) {
    if (args.verbose) console.log(`${c.dim}Reading documents from ${inputPath}...${c.reset}`);
    documents = await readDocuments(inputPath, { format: args.format });
    console.log(`${c.green}✓${c.reset} Loaded ${c.bold}${documents.length}${c.reset} documents\n`);

    if (documents.length === 0) {
      console.log(`${c.yellow}⚠ No documents found. Check your input path.${c.reset}`);
      process.exit(0);
    }
  } else {
    // Mock mode — generate sample entries from schemas
    const entriesPerType = args.entriesPerType || config.entriesPerType || 3;
    const allSchemas = schemas.getAll();
    const mockResult = generateMockData(allSchemas, {
      entriesPerType,
      baseLocale,
      locales: locales || [baseLocale],
      name: projectName,
    });
    documents = mockResult.documents;
    mockAssets = mockResult.assets;
    console.log(`${c.green}✓${c.reset} Generated ${c.bold}${documents.length}${c.reset} mock entries (${entriesPerType}/type)\n`);
  }

  // ── Step 3: Load custom transformers ────────────────────────
  const transformers = new TransformerRegistry();
  if (args.transforms) {
    const transformsPath = resolve(args.transforms);
    if (existsSync(transformsPath)) {
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
    assets: mockAssets,
    options: {
      name: projectName,
      baseLocale,
      locales,
      localeMap,
      fieldGroupMap: config.fieldGroupMap || null,
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
    execFile(cmd, [browserPath], () => {});
    console.log(`\n${c.cyan}Opening content browser...${c.reset}`);
  }

  console.log('');
}

// ── Pull sub-command ─────────────────────────────────────────────
async function pullMain(argv) {
  const args = {
    spaceId: process.env.CONTENTFUL_SPACE_ID || null,
    accessToken: process.env.CONTENTFUL_ACCESS_TOKEN || null,
    environment: 'master',
    output: './contentful-export',
    includeEntries: false,
    maxEntries: 1000,
    verbose: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg === '--include-entries') { args.includeEntries = true; continue; }

    const eq = arg.indexOf('=');
    if (eq === -1) continue;
    const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
    const val = arg.substring(eq + 1);

    switch (key) {
      case 'space-id': args.spaceId = val; break;
      case 'access-token': args.accessToken = val; break;
      case 'environment': args.environment = val; break;
      case 'output': args.output = val; break;
      case 'max-entries': args.maxEntries = parseInt(val, 10) || 1000; break;
    }
  }

  if (args.help) { showPullHelp(); process.exit(0); }

  if (args.maxEntries !== 1000 && !args.includeEntries) {
    console.log(`${c.yellow}⚠ --max-entries has no effect without --include-entries${c.reset}\n`);
  }

  const outputDir = resolve(args.output);

  console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Content Model Simulator — Pull${c.reset}`);
  console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);
  console.log(`${c.dim}Downloading content model from Contentful (read-only)...${c.reset}\n`);

  const { pull } = await import('../dist/contentful/pull.js');

  const result = await pull({
    spaceId: args.spaceId,
    accessToken: args.accessToken,
    environment: args.environment,
    outputDir,
    includeEntries: args.includeEntries,
    maxEntries: args.maxEntries,
    verbose: args.verbose,
  });

  console.log(`\n${c.green}✓${c.reset} Downloaded ${c.bold}${result.schemas.length}${c.reset} content types`);
  console.log(`${c.green}✓${c.reset} ${c.bold}${result.locales.length}${c.reset} locales (base: ${result.defaultLocale})`);
  if (result.documents) {
    console.log(`${c.green}✓${c.reset} ${c.bold}${result.documents.length}${c.reset} entry-locale documents`);
  }

  console.log(`\n${c.cyan}${'─'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Output:${c.reset} ${outputDir}`);
  console.log(`${c.dim}  schemas/              → ${result.schemas.length} content type definitions${c.reset}`);
  console.log(`${c.dim}  contentful-space.json  → locales & metadata${c.reset}`);
  if (result.documents) {
    console.log(`${c.dim}  data/entries.ndjson   → ${result.documents.length} documents${c.reset}`);
  }

  console.log(`\n${c.cyan}Next steps:${c.reset}`);
  const outBase = args.output.replace(/\/+$/, '');
  if (result.documents) {
    console.log(`  cms-sim --schemas=${outBase}/schemas/ --input=${outBase}/data/entries.ndjson --open`);
  } else {
    console.log(`  cms-sim --schemas=${outBase}/schemas/ --open`);
  }
  console.log('');
}

// ── Entry point ──────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const subCommand = rawArgs[0] === 'pull' ? 'pull' : 'simulate';

if (subCommand === 'pull') {
  pullMain(rawArgs.slice(1)).catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
} else {
  main().catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
