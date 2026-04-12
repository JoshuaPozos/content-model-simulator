/**
 * content-model-simulator CLI
 *
 * Usage:
 *   cms-sim --schemas <dir> [options]        Simulate locally
 *   cms-sim pull --space-id=XXX [options]    Download from Contentful
 *   cms-sim --help
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, watch as fsWatch, statSync, realpathSync } from 'node:fs';
import { resolve, join, basename, extname, sep } from 'node:path';
import { execFile } from 'node:child_process';

import { readDocuments } from './core/reader.js';
import { SchemaRegistry } from './core/schema-registry.js';
import { TransformerRegistry } from './transform/transformer.js';
import { simulate } from './core/simulator.js';
import { generateMockData } from './core/mock-generator.js';
import { generateContentBrowserHTML } from './output/content-browser.js';
import { generateModelGraphHTML } from './output/model-graph.js';
import { writeReport } from './output/json-writer.js';
import { parseWXR } from './wordpress/wxr-reader.js';
import { scaffoldFromWXR } from './wordpress/wxr-scaffold.js';
import type { SimulationReport } from './types.js';

// ── Interfaces ───────────────────────────────────────────────────
interface SimulateArgs {
  input: string | null;
  schemas: string | null;
  transforms: string | null;
  plugins: string | null;
  config: string | null;
  output: string | null;
  name: string | null;
  baseLocale: string;
  locales: string | null;
  localeMap: string | null;
  entriesPerType: number | null;
  templateCSS: string | null;
  templateHead: string | null;
  format: 'ndjson' | 'json-array' | 'json-dir' | 'wxr' | 'auto';
  open: boolean;
  watch: boolean;
  verbose: boolean;
  json: boolean;
  help: boolean;
}

interface PullArgs {
  spaceId: string | null;
  accessToken: string | null;
  environment: string;
  output: string;
  includeEntries: boolean;
  includeAssets: boolean;
  maxEntries: number;
  contentType: string | null;
  preview: boolean;
  verbose: boolean;
  help: boolean;
}

interface ValidateArgs {
  schemas: string | null;
  input: string | null;
  transforms: string | null;
  plugins: string | null;
  config: string | null;
  baseLocale: string;
  locales: string | null;
  localeMap: string | null;
  format: 'ndjson' | 'json-array' | 'json-dir' | 'wxr' | 'auto';
  verbose: boolean;
  json: boolean;
  help: boolean;
}

interface ScaffoldArgs {
  input: string | null;
  output: string | null;
  help: boolean;
  verbose: boolean;
}

interface InitArgs {
  name: string | null;
  help: boolean;
}

// ── Terminal colours ─────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};

/** Verify a resolved file path stays within the expected base directory (prevents symlink escape). */
function ensureWithinDir(baseDir: string, filePath: string): void {
  const resolved = realpathSync(filePath);
  const base = realpathSync(baseDir);
  if (!resolved.startsWith(base + sep) && resolved !== base) {
    throw new Error(`Security: ${filePath} resolves outside the allowed directory ${baseDir}`);
  }
}

// ── Arg parsing ──────────────────────────────────────────────────
function parseArgs(argv: string[]): SimulateArgs {
  const args: SimulateArgs = {
    input: null,
    schemas: null,
    transforms: null,
    plugins: null,
    config: null,
    output: null,
    name: null,
    baseLocale: 'en',
    locales: null,
    localeMap: null,
    entriesPerType: null,
    templateCSS: null,
    templateHead: null,
    format: 'auto',
    open: false,
    watch: false,
    verbose: false,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg === '--open') { args.open = true; continue; }
    if (arg === '--watch' || arg === '-w') { args.watch = true; continue; }
    if (arg === '--json') { args.json = true; continue; }

    const eq = arg.indexOf('=');
    if (eq === -1) continue;
    const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
    const val = arg.substring(eq + 1);

    switch (key) {
      case 'input': args.input = val; break;
      case 'schemas': args.schemas = val; break;
      case 'transforms': args.transforms = val; break;
      case 'plugins': args.plugins = val; break;
      case 'config': args.config = val; break;
      case 'output': args.output = val; break;
      case 'name': args.name = val; break;
      case 'base-locale': args.baseLocale = val; break;
      case 'locales': args.locales = val; break;
      case 'locale-map': args.localeMap = val; break;
      case 'entries-per-type': args.entriesPerType = parseInt(val, 10) || null; break;
      case 'template-css': args.templateCSS = val; break;
      case 'template-head': args.templateHead = val; break;
      case 'format': args.format = val as SimulateArgs['format']; break;
    }
  }
  return args;
}

function showHelp(): void {
  console.log(`
${c.bold}Content Model Simulator${c.reset}
Preview your Contentful content model locally — never connects to Contentful during simulation.
Runs 100% offline. Does not upload or migrate anything.

${c.cyan}COMMANDS:${c.reset}
  cms-sim [options]              ${c.dim}Run local simulation (default)${c.reset}
  cms-sim init [<name>]          ${c.dim}Scaffold a new project${c.reset}
  cms-sim scaffold [options]     ${c.dim}Generate schemas + transforms from a WordPress XML export${c.reset}
  cms-sim pull [options]         ${c.dim}Download content model from Contentful${c.reset}
  cms-sim diff --old=A --new=B   ${c.dim}Compare two schema directories${c.reset}
  cms-sim validate [options]     ${c.dim}Validate schemas + data (no HTML output)${c.reset}

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
  --plugins=<dir>       Plugin directory (auto-discovers schemas/, transforms/, *.js setup files)
  --config=<file>       Configuration file (JSON)
  --output=<dir>        Custom output directory (default: ./output/<name>_<timestamp>)
  --name=<string>       Project name (default: derived from input or schemas dir)
  --base-locale=<code>  Base locale code (default: en)
  --locales=<list>      Comma-separated locale codes (default: base locale only)
  --locale-map=<file>   JSON file mapping source → target locale codes
  --entries-per-type=<n> Mock entries per content type (default: 3, only without --input)
  --template-css=<file> Custom CSS file to inject into HTML output
  --template-head=<file> Custom HTML to inject into <head> (e.g. fonts, meta tags)
  --format=<fmt>        Input format: ndjson, json, dir (default: auto-detect)
  --json                Write JSON output only (skip HTML)
  --open                Auto-open HTML report in browser
  --watch, -w           Watch schemas/input for changes and re-run automatically
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

function showPullHelp(): void {
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
  --include-assets      Download asset files (images, documents)
  --max-entries=<n>     Max entries to download (default: 1000)
  --content-type=<id>   Only fetch entries of this content type
  --preview             Use Content Preview API (drafts) instead of CDA
  --verbose, -v         Verbose logging
  --help, -h            Show this help

${c.cyan}OUTPUT:${c.reset}
  <output>/
    schemas/              ${c.dim}One .js file per content type (ready for cms-sim)${c.reset}
    contentful-space.json ${c.dim}Space metadata (locales, base locale, pulled date)${c.reset}
    data/entries.ndjson   ${c.dim}Entries in NDJSON (only with --include-entries)${c.reset}
    assets/               ${c.dim}Downloaded asset files + assets.json index (only with --include-assets)${c.reset}

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

${c.yellow}Note:${c.reset} Your access token is never stored or logged. Use a CDA (read-only) or CPA (preview) token.
`);
}

// ── Main ─────────────────────────────────────────────────────────
async function runSimulation(args: SimulateArgs): Promise<void> {
  const schemasPath = resolve(args.schemas!);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let config: Record<string, any> = {};
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
  let documents: Awaited<ReturnType<typeof readDocuments>> | ReturnType<typeof generateMockData>['documents'];
  let mockAssets: ReturnType<typeof generateMockData>['assets'] | undefined = undefined;
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
      const files = readdirSync(transformsPath).filter(f => /\.(js|mjs)$/.test(f));
      for (const file of files) {
        const fullPath = join(transformsPath, file);
        ensureWithinDir(transformsPath, fullPath);
        const mod = await import(fullPath);
        if (typeof mod.register === 'function') {
          mod.register(transformers);
        }
      }
      if (args.verbose) console.log(`${c.dim}Loaded ${files.length} transformer module(s)${c.reset}\n`);
    }
  }

  // ── Step 3b: Load plugins ──────────────────────────────────
  if (args.plugins) {
    const pluginsPath = resolve(args.plugins);
    if (!existsSync(pluginsPath)) {
      console.error(`${c.red}Error: Plugins directory not found: ${pluginsPath}${c.reset}`);
      process.exit(1);
    }

    let pluginCount = 0;

    // Auto-discover schemas/ subdirectory
    const pluginSchemas = join(pluginsPath, 'schemas');
    if (existsSync(pluginSchemas)) {
      await schemas.loadFromDirectory(pluginSchemas);
      pluginCount++;
      if (args.verbose) console.log(`${c.dim}Plugin: loaded schemas from ${pluginSchemas}${c.reset}`);
    }

    // Auto-discover transforms/ subdirectory
    const pluginTransforms = join(pluginsPath, 'transforms');
    if (existsSync(pluginTransforms)) {
      const tFiles = readdirSync(pluginTransforms).filter(f => /\.(js|mjs)$/.test(f));
      for (const file of tFiles) {
        const fullPath = join(pluginTransforms, file);
        ensureWithinDir(pluginsPath, fullPath);
        const mod = await import(fullPath);
        if (typeof mod.register === 'function') {
          mod.register(transformers);
        }
      }
      pluginCount++;
      if (args.verbose) console.log(`${c.dim}Plugin: loaded ${tFiles.length} transform(s) from ${pluginTransforms}${c.reset}`);
    }

    // Load root-level .js files with setup() function
    const rootFiles = readdirSync(pluginsPath).filter(f => /\.(js|mjs)$/.test(f));
    for (const file of rootFiles) {
      const fullPath = join(pluginsPath, file);
      ensureWithinDir(pluginsPath, fullPath);
      const mod = await import(fullPath);
      if (typeof mod.setup === 'function') {
        await mod.setup({ schemas, transformers });
        pluginCount++;
        if (args.verbose) console.log(`${c.dim}Plugin: ${file} setup() called${c.reset}`);
      }
    }

    if (pluginCount > 0) {
      console.log(`${c.green}✓${c.reset} Loaded plugins from ${c.bold}${args.plugins}${c.reset}\n`);
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

  const report: SimulationReport = simulate({
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
    const grouped: Record<string, typeof report.warnings> = {};
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
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '-');
  const outputDir = args.output
    ? resolve(args.output)
    : args.watch
      ? resolve('output', safeName)
      : resolve('output', `${safeName}_${timestamp}`);

  // JSON output
  const { filesWritten } = writeReport(report, outputDir);

  // HTML output (unless --json)
  let browserPath: string | undefined, graphPath: string | undefined;
  if (!args.json) {
    const htmlOpts: { customCSS?: string; customHead?: string } = {};
    if (args.templateCSS) {
      const cssPath = resolve(args.templateCSS);
      if (existsSync(cssPath)) htmlOpts.customCSS = readFileSync(cssPath, 'utf-8');
      else console.log(`${c.yellow}⚠ --template-css file not found: ${cssPath}${c.reset}`);
    }
    if (args.templateHead) {
      const headPath = resolve(args.templateHead);
      if (existsSync(headPath)) htmlOpts.customHead = readFileSync(headPath, 'utf-8');
      else console.log(`${c.yellow}⚠ --template-head file not found: ${headPath}${c.reset}`);
    }
    let browserHTML = generateContentBrowserHTML(report, htmlOpts);
    let graphHTML = generateModelGraphHTML(report, htmlOpts);

    // Inject auto-reload script when in watch mode
    if (args.watch) {
      const reloadScript = `<script>
(function(){
  var last = null;
  setInterval(function(){
    fetch('manifest.json?_=' + Date.now())
      .then(function(r){ return r.json(); })
      .then(function(d){
        var ts = d.generatedAt || d.timestamp || JSON.stringify(d);
        if (last && ts !== last) location.reload();
        last = ts;
      })
      .catch(function(){});
  }, 1500);
})();
</script>`;
      browserHTML = browserHTML.replace('</body>', reloadScript + '\n</body>');
      graphHTML = graphHTML.replace('</body>', reloadScript + '\n</body>');
    }

    browserPath = join(outputDir, 'content-browser.html');
    graphPath = join(outputDir, 'visual-report.html');
    writeFileSync(browserPath, browserHTML, 'utf-8');
    writeFileSync(graphPath, graphHTML, 'utf-8');
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

  // ── Watch mode ──────────────────────────────────────────────
  if (args.watch) {
    console.log(`${c.cyan}Watching for changes...${c.reset} (press Ctrl+C to stop)\n`);

    const watchPaths = [schemasPath];
    if (inputPath) watchPaths.push(inputPath);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 300;

    const onChange = (_eventType: string, filename: string | null) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const changedFile = filename || '(unknown)';
        console.log(`\n${c.cyan}${'─'.repeat(68)}${c.reset}`);
        console.log(`${c.dim}[${new Date().toLocaleTimeString()}] Change detected: ${changedFile}${c.reset}`);
        console.log(`${c.cyan}${'─'.repeat(68)}${c.reset}\n`);
        try {
          // Re-invoke main without --watch to avoid nested watchers
          const reArgs = { ...args, watch: false, open: false };
          await runSimulation(reArgs);
        } catch (e: unknown) {
          console.error(`${c.red}${c.bold}Error during re-run:${c.reset} ${(e as Error).message}`);
        }
        console.log(`${c.cyan}Watching for changes...${c.reset} (press Ctrl+C to stop)\n`);
      }, DEBOUNCE_MS);
    };

    const watchers: ReturnType<typeof fsWatch>[] = [];
    for (const wp of watchPaths) {
      try {
        const isDir = statSync(wp).isDirectory();
        watchers.push(fsWatch(wp, { recursive: isDir }, onChange));
      } catch {
        console.error(`${c.yellow}⚠ Cannot watch ${wp}${c.reset}`);
      }
    }

    // Keep process alive, clean up on exit
    process.on('SIGINT', () => {
      for (const w of watchers) w.close();
      console.log(`\n${c.dim}Watch mode stopped.${c.reset}`);
      process.exit(0);
    });

    // Return a promise that never resolves (keeps main alive)
    return new Promise(() => {});
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { showHelp(); process.exit(0); }

  if (!args.schemas) {
    console.error(`${c.red}Error: --schemas is required${c.reset}`);
    showHelp();
    process.exit(1);
  }

  await runSimulation(args);
}

// ── Pull sub-command ─────────────────────────────────────────────
async function pullMain(argv: string[]): Promise<void> {
  const args: PullArgs = {
    spaceId: process.env.CONTENTFUL_SPACE_ID || null,
    accessToken: process.env.CONTENTFUL_ACCESS_TOKEN || null,
    environment: 'master',
    output: './contentful-export',
    includeEntries: false,
    includeAssets: false,
    maxEntries: 1000,
    contentType: null,
    preview: false,
    verbose: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg === '--include-entries') { args.includeEntries = true; continue; }
    if (arg === '--include-assets') { args.includeAssets = true; continue; }
    if (arg === '--preview') { args.preview = true; continue; }

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
      case 'content-type': args.contentType = val; break;
    }
  }

  if (args.help) { showPullHelp(); process.exit(0); }

  if (args.maxEntries !== 1000 && !args.includeEntries) {
    console.log(`${c.yellow}⚠ --max-entries has no effect without --include-entries${c.reset}\n`);
  }

  if (args.contentType && !args.includeEntries) {
    console.log(`${c.yellow}⚠ --content-type has no effect without --include-entries${c.reset}\n`);
  }

  const outputDir = resolve(args.output);

  console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Content Model Simulator — Pull${c.reset}${args.preview ? ` ${c.yellow}(Preview API)${c.reset}` : ''}`);
  console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);
  console.log(`${c.dim}Downloading content model from Contentful (read-only${args.preview ? ', including drafts' : ''})...${c.reset}\n`);

  const { pull } = await import('./contentful/pull.js');

  const result = await pull({
    spaceId: args.spaceId!,
    accessToken: args.accessToken!,
    environment: args.environment,
    outputDir,
    includeEntries: args.includeEntries,
    includeAssets: args.includeAssets,
    maxEntries: args.maxEntries,
    contentType: args.contentType || undefined,
    usePreview: args.preview,
    verbose: args.verbose,
  });

  console.log(`\n${c.green}✓${c.reset} Downloaded ${c.bold}${result.schemas.length}${c.reset} content types`);
  console.log(`${c.green}✓${c.reset} ${c.bold}${result.locales.length}${c.reset} locales (base: ${result.defaultLocale})`);
  if (result.documents) {
    console.log(`${c.green}✓${c.reset} ${c.bold}${result.documents.length}${c.reset} entry-locale documents`);
  }
  if (result.assets) {
    console.log(`${c.green}✓${c.reset} ${c.bold}${result.assets.length}${c.reset} asset files downloaded`);
  }

  console.log(`\n${c.cyan}${'─'.repeat(68)}${c.reset}`);
  console.log(`${c.bold}Output:${c.reset} ${outputDir}`);
  console.log(`${c.dim}  schemas/              → ${result.schemas.length} content type definitions${c.reset}`);
  console.log(`${c.dim}  contentful-space.json  → locales & metadata${c.reset}`);
  if (result.documents) {
    console.log(`${c.dim}  data/entries.ndjson   → ${result.documents.length} documents${c.reset}`);
  }
  if (result.assets) {
    console.log(`${c.dim}  assets/               → ${result.assets.length} files + assets.json index${c.reset}`);
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

// ── Diff sub-command ─────────────────────────────────────────────
async function diffMain(argv: string[]): Promise<void> {
  let oldDir: string | null = null, newDir: string | null = null, help = false, jsonOut = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { help = true; continue; }
    if (arg === '--json') { jsonOut = true; continue; }

    const eq = arg.indexOf('=');
    if (eq === -1) continue;
    const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
    const val = arg.substring(eq + 1);

    switch (key) {
      case 'old': oldDir = val; break;
      case 'new': newDir = val; break;
    }
  }

  if (help || !oldDir || !newDir) {
    console.log(`
${c.bold}Content Model Simulator — Diff${c.reset}
Compare two schema directories or two simulation output directories.
Auto-detects mode: if directories contain manifest.json, performs a full report diff;
otherwise compares schemas only.

${c.cyan}USAGE:${c.reset}
  cms-sim diff --old=<dir> --new=<dir> [options]

${c.cyan}REQUIRED:${c.reset}
  --old=<dir>   Original directory (schemas/ or simulation output)
  --new=<dir>   Updated directory (schemas/ or simulation output)

${c.cyan}OPTIONS:${c.reset}
  --json        Output diff as JSON
  --help, -h    Show this help

${c.cyan}EXAMPLES:${c.reset}
  cms-sim diff --old=v1/schemas/ --new=v2/schemas/
  cms-sim diff --old=output-v1/ --new=output-v2/
`);
    process.exit(help ? 0 : 1);
  }

  const oldPath = resolve(oldDir);
  const newPath = resolve(newDir);

  if (!existsSync(oldPath)) {
    console.error(`${c.red}Error: --old directory not found: ${oldPath}${c.reset}`);
    process.exit(1);
  }
  if (!existsSync(newPath)) {
    console.error(`${c.red}Error: --new directory not found: ${newPath}${c.reset}`);
    process.exit(1);
  }

  // Auto-detect mode: report diff if both dirs contain manifest.json
  const isReportDiff = existsSync(join(oldPath, 'manifest.json')) && existsSync(join(newPath, 'manifest.json'));

  if (isReportDiff) {
    const { diffReports, formatReportDiff } = await import('./core/report-diff.js');
    const result = diffReports(oldPath, newPath);

    if (jsonOut) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
      console.log(`${c.bold}Content Model Simulator — Report Diff${c.reset}`);
      console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);
      console.log(formatReportDiff(result));
      console.log('');
    }
  } else {
    const { SchemaRegistry: SR } = await import('./core/schema-registry.js');
    const { diffSchemas, formatDiff } = await import('./core/schema-diff.js');

    const oldSchemas = new SR();
    await oldSchemas.loadFromDirectory(oldPath);
    const newSchemas = new SR();
    await newSchemas.loadFromDirectory(newPath);

    const result = diffSchemas(oldSchemas.getAll(), newSchemas.getAll());

    if (jsonOut) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
      console.log(`${c.bold}Content Model Simulator — Schema Diff${c.reset}`);
      console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);
      console.log(`${c.dim}Old: ${oldPath}${c.reset}`);
      console.log(`${c.dim}New: ${newPath}${c.reset}\n`);
      console.log(formatDiff(result));
      console.log('');
    }
  }
}

// ── Validate sub-command ─────────────────────────────────────────
async function validateMain(argv: string[]): Promise<void> {
  const args: ValidateArgs = {
    schemas: null,
    input: null,
    transforms: null,
    plugins: null,
    config: null,
    baseLocale: 'en',
    locales: null,
    localeMap: null,
    format: 'auto',
    verbose: false,
    json: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    if (arg === '--json') { args.json = true; continue; }

    const eq = arg.indexOf('=');
    if (eq === -1) continue;
    const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
    const val = arg.substring(eq + 1);

    switch (key) {
      case 'schemas': args.schemas = val; break;
      case 'input': args.input = val; break;
      case 'transforms': args.transforms = val; break;
      case 'plugins': args.plugins = val; break;
      case 'config': args.config = val; break;
      case 'base-locale': args.baseLocale = val; break;
      case 'locales': args.locales = val; break;
      case 'locale-map': args.localeMap = val; break;
      case 'format': args.format = val as ValidateArgs['format']; break;
    }
  }

  if (args.help) {
    console.log(`
${c.bold}Content Model Simulator — Validate${c.reset}
Validate schemas and data without generating HTML output. Fast, CI-friendly.

${c.cyan}USAGE:${c.reset}
  cms-sim validate --schemas=<dir> [options]

${c.cyan}REQUIRED:${c.reset}
  --schemas=<dir>       Directory with content type definitions

${c.cyan}OPTIONS:${c.reset}
  --input=<path>        Source data file or directory
  --transforms=<dir>    Directory with custom transformer modules
  --plugins=<dir>       Plugin directory (auto-discovers schemas/, transforms/, *.js setup files)
  --config=<file>       Configuration file (JSON)
  --base-locale=<code>  Base locale code (default: en)
  --locales=<list>      Comma-separated locale codes
  --locale-map=<file>   JSON file mapping source → target locale codes
  --format=<fmt>        Input format: ndjson, json, dir (default: auto-detect)
  --json                Output results as JSON
  --verbose, -v         Verbose logging
  --help, -h            Show this help

${c.cyan}EXAMPLES:${c.reset}
  ${c.dim}# Validate schemas only (mock data)${c.reset}
  cms-sim validate --schemas=schemas/

  ${c.dim}# Validate schemas + data${c.reset}
  cms-sim validate --schemas=schemas/ --input=data/entries.ndjson

  ${c.dim}# CI pipeline (exit code 1 on errors)${c.reset}
  cms-sim validate --schemas=schemas/ --input=data/ --json
`);
    process.exit(0);
  }

  if (!args.schemas) {
    console.error(`${c.red}Error: --schemas is required${c.reset}`);
    process.exit(1);
  }

  const schemasPath = resolve(args.schemas);
  const inputPath = args.input ? resolve(args.input) : null;

  if (!existsSync(schemasPath)) {
    console.error(`${c.red}Error: Schemas directory not found: ${schemasPath}${c.reset}`);
    process.exit(1);
  }
  if (inputPath && !existsSync(inputPath)) {
    console.error(`${c.red}Error: Input not found: ${inputPath}${c.reset}`);
    process.exit(1);
  }

  // Load config
  let config: Record<string, any> = {};
  if (args.config) {
    const configPath = resolve(args.config);
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf-8'));
    }
  }

  // Load schemas
  const schemas = new SchemaRegistry();
  await schemas.loadFromDirectory(schemasPath);

  // Load or generate documents
  let documents;
  const baseLocale = args.baseLocale || config.baseLocale || 'en';
  const locales = args.locales
    ? args.locales.split(',').map(l => l.trim())
    : (config.locales || null);

  if (inputPath) {
    documents = await readDocuments(inputPath, { format: args.format });
  } else {
    const mockResult = generateMockData(schemas.getAll(), {
      entriesPerType: 3,
      baseLocale,
      locales: locales || [baseLocale],
    });
    documents = mockResult.documents;
  }

  // Load transformers
  const transformers = new TransformerRegistry();
  if (args.transforms) {
    const transformsPath = resolve(args.transforms);
    if (existsSync(transformsPath)) {
      const files = readdirSync(transformsPath).filter(f => /\.(js|mjs)$/.test(f));
      for (const file of files) {
        const fullPath = join(transformsPath, file);
        ensureWithinDir(transformsPath, fullPath);
        const mod = await import(fullPath);
        if (typeof mod.register === 'function') {
          mod.register(transformers);
        }
      }
    }
  }

  // Load plugins
  if (args.plugins) {
    const pluginsPath = resolve(args.plugins);
    if (existsSync(pluginsPath)) {
      const pluginSchemas = join(pluginsPath, 'schemas');
      if (existsSync(pluginSchemas)) await schemas.loadFromDirectory(pluginSchemas);
      const pluginTransforms = join(pluginsPath, 'transforms');
      if (existsSync(pluginTransforms)) {
        for (const f of readdirSync(pluginTransforms).filter(f => /\.(js|mjs)$/.test(f))) {
          const fullPath = join(pluginTransforms, f);
          ensureWithinDir(pluginsPath, fullPath);
          const mod = await import(fullPath);
          if (typeof mod.register === 'function') mod.register(transformers);
        }
      }
      for (const f of readdirSync(pluginsPath).filter(f => /\.(js|mjs)$/.test(f))) {
        const fullPath = join(pluginsPath, f);
        ensureWithinDir(pluginsPath, fullPath);
        const mod = await import(fullPath);
        if (typeof mod.setup === 'function') await mod.setup({ schemas, transformers });
      }
    }
  }

  // Locale map
  let localeMap = config.localeMap || null;
  if (args.localeMap) {
    const mapPath = resolve(args.localeMap);
    if (existsSync(mapPath)) {
      localeMap = JSON.parse(readFileSync(mapPath, 'utf-8'));
    }
  }

  // Run simulation
  const report = simulate({
    documents,
    schemas,
    transformers,
    options: {
      baseLocale,
      locales,
      localeMap,
      fieldGroupMap: config.fieldGroupMap || null,
      verbose: args.verbose,
    },
  });

  // Output
  if (args.json) {
    console.log(JSON.stringify({
      valid: report.errors.length === 0,
      contentTypes: report.stats.totalCTs,
      entries: report.stats.totalComponents,
      locales: report.stats.totalLocales,
      errors: report.errors,
      warnings: report.warnings,
    }, null, 2));
  } else {
    console.log(`\n${c.cyan}${'═'.repeat(68)}${c.reset}`);
    console.log(`${c.bold}Content Model Simulator — Validate${c.reset}`);
    console.log(`${c.cyan}${'═'.repeat(68)}${c.reset}\n`);

    console.log(`  Content Types: ${c.bold}${report.stats.totalCTs}${c.reset}`);
    console.log(`  Entries:       ${c.bold}${report.stats.totalComponents}${c.reset}`);
    console.log(`  Locales:       ${c.bold}${report.stats.totalLocales}${c.reset}`);

    if (report.errors.length > 0) {
      console.log(`\n${c.red}${c.bold}Errors (${report.errors.length}):${c.reset}`);
      for (const e of report.errors) {
        console.log(`  ${c.red}✗${c.reset} ${e.type} ${e.contentType || ''} ${e.message || ''}`);
      }
    }

    if (report.warnings.length > 0) {
      console.log(`\n${c.yellow}${c.bold}Warnings (${report.warnings.length}):${c.reset}`);
      const grouped: Record<string, typeof report.warnings> = {};
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

    if (report.errors.length === 0 && report.warnings.length === 0) {
      console.log(`\n  ${c.green}✓ No errors or warnings${c.reset}`);
    } else if (report.errors.length === 0) {
      console.log(`\n  ${c.green}✓ No errors${c.reset} (${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'})`);
    }

    console.log('');
  }

  // Exit code 1 if there are errors (useful for CI)
  if (report.errors.length > 0) {
    process.exit(1);
  }
}

// ── Scaffold sub-command ─────────────────────────────────────────
async function scaffoldMain(argv: string[]): Promise<void> {
  const args: ScaffoldArgs = { input: null, output: null, help: false, verbose: false };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (arg === '--verbose' || arg === '-v') { args.verbose = true; continue; }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
      const val = arg.substring(eq + 1);
      switch (key) {
        case 'input': args.input = val; break;
        case 'output': args.output = val; break;
      }
    } else if (!arg.startsWith('-') && !args.input) {
      args.input = arg;
    }
  }

  if (args.help) {
    console.log(`
${c.bold}Content Model Simulator — Scaffold${c.reset}
Generate Contentful schemas and transforms from a WordPress XML export.

Analyzes your WXR export and creates ready-to-use files that you can
customize and immediately simulate.

${c.cyan}USAGE:${c.reset}
  cms-sim scaffold --input=<file.xml> [--output=<dir>]

${c.cyan}REQUIRED:${c.reset}
  --input=<file>        WordPress XML export file (WXR format)

${c.cyan}OPTIONS:${c.reset}
  --output=<dir>        Output directory (default: wp-migration)
  --verbose, -v         Show detailed analysis
  --help, -h            Show this help

${c.cyan}EXAMPLES:${c.reset}
  ${c.dim}# Generate from WordPress export${c.reset}
  cms-sim scaffold --input=wordpress-export.xml

  ${c.dim}# Generate to custom directory${c.reset}
  cms-sim scaffold --input=export.xml --output=my-migration

${c.cyan}WHAT IT CREATES:${c.reset}
  <output>/
  ├── schemas/
  │   ├── blogPost.js       ${c.dim}Content type definitions (one per WP type)${c.reset}
  │   ├── author.js
  │   ├── category.js
  │   └── ...
  ├── transforms/
  │   └── wordpress.js      ${c.dim}Field mapping (WP → Contentful)${c.reset}
  └── README.md             ${c.dim}Customization guide${c.reset}

${c.cyan}NEXT STEPS:${c.reset}
  1. Review and customize the generated files
  2. Run: cms-sim --schemas=<output>/schemas/ --input=<file.xml> --transforms=<output>/transforms/ --open
  3. Iterate until the Content Browser shows your content correctly
`);
    process.exit(0);
  }

  if (!args.input) {
    console.error(`${c.red}Error: --input is required. Specify a WordPress XML export file.${c.reset}`);
    console.error(`${c.dim}Run cms-sim scaffold --help for usage.${c.reset}`);
    process.exit(1);
  }

  const inputPath = resolve(args.input);
  if (!existsSync(inputPath)) {
    console.error(`${c.red}Error: File not found: ${args.input}${c.reset}`);
    process.exit(1);
  }

  const outputDir = resolve(args.output || 'wp-migration');
  if (existsSync(outputDir)) {
    console.error(`${c.red}Error: Output directory already exists: ${basename(outputDir)}/${c.reset}`);
    console.error(`${c.dim}Choose a different --output or remove the existing directory.${c.reset}`);
    process.exit(1);
  }

  console.log(`${c.cyan}Analyzing WordPress export...${c.reset}`);
  const wxr = parseWXR(inputPath);
  const { analysis, files } = scaffoldFromWXR(wxr);

  // Write files
  for (const [relPath, content] of files) {
    const fullPath = join(outputDir, relPath);
    const dir = join(fullPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }

  // Summary
  console.log(`
${c.green}${c.bold}✓ Scaffold generated: ${basename(outputDir)}/${c.reset}

  ${c.bold}Site:${c.reset} ${analysis.site.title} (${analysis.site.url})
  ${c.bold}Language:${c.reset} ${analysis.site.language}
`);

  console.log(`  ${c.bold}Content types discovered:${c.reset}`);
  for (const ct of analysis.contentTypes) {
    console.log(`    ${c.green}${ct.sourceType}${c.reset} → ${c.cyan}${ct.contentfulId}${c.reset} (${ct.documentCount} docs, ${ct.fields.length} fields)`);
  }

  if (analysis.skippedTypes.length > 0) {
    console.log(`\n  ${c.dim}Skipped: ${analysis.skippedTypes.join(', ')}${c.reset}`);
  }

  if (args.verbose) {
    console.log('');
    for (const ct of analysis.contentTypes) {
      console.log(`  ${c.bold}${ct.contentfulId}${c.reset} fields:`);
      for (const f of ct.fields) {
        const req = f.required ? `${c.yellow}*${c.reset}` : ' ';
        const loc = f.localized ? ` ${c.dim}(localized)${c.reset}` : '';
        console.log(`    ${req} ${f.id}: ${c.cyan}${f.type}${c.reset}${loc}`);
      }
    }
  }

  // File tree
  const sortedFiles = [...files.keys()].sort();
  console.log(`\n  ${c.bold}Files created:${c.reset}`);
  for (const f of sortedFiles) {
    console.log(`    ${c.dim}${basename(outputDir)}/${c.reset}${f}`);
  }

  console.log(`
${c.cyan}Next steps:${c.reset}
  ${c.dim}# Preview your migration${c.reset}
  cms-sim --schemas=${basename(outputDir)}/schemas/ --input=${basename(inputPath)} --transforms=${basename(outputDir)}/transforms/ --open

  ${c.dim}# Watch mode for iterating${c.reset}
  cms-sim --schemas=${basename(outputDir)}/schemas/ --input=${basename(inputPath)} --transforms=${basename(outputDir)}/transforms/ --watch --open
`);
}

// ── Init sub-command ─────────────────────────────────────────────
function initMain(argv: string[]): void {
  const args: InitArgs = { name: null, help: false };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      const key = arg.startsWith('--') ? arg.substring(2, eq) : arg.substring(0, eq);
      if (key === 'name') args.name = arg.substring(eq + 1);
    } else if (!arg.startsWith('-') && !args.name) {
      args.name = arg;
    }
  }

  if (args.help) {
    console.log(`
${c.bold}Content Model Simulator — Init${c.reset}
Scaffold a new content model project with example schemas.

${c.cyan}USAGE:${c.reset}
  cms-sim init [<name>] [options]

${c.cyan}ARGUMENTS:${c.reset}
  <name>                Project directory name (default: my-content-model)

${c.cyan}OPTIONS:${c.reset}
  --name=<string>       Project name (alternative to positional argument)
  --help, -h            Show this help

${c.cyan}EXAMPLES:${c.reset}
  ${c.dim}# Create with default name${c.reset}
  cms-sim init

  ${c.dim}# Create with custom name${c.reset}
  cms-sim init my-blog

${c.cyan}WHAT IT CREATES:${c.reset}
  <name>/
  ├── schemas/
  │   ├── blogPost.js       ${c.dim}Example content type${c.reset}
  │   └── author.js         ${c.dim}Example content type${c.reset}
  └── README.md             ${c.dim}Quick-start guide${c.reset}
`);
    process.exit(0);
  }

  const projectName = args.name || 'my-content-model';
  const safeName = projectName.replace(/[^a-zA-Z0-9_.-]/g, '-');
  const projectDir = resolve(safeName);

  if (existsSync(projectDir)) {
    console.error(`${c.red}Error: Directory already exists: ${safeName}/${c.reset}`);
    console.error(`${c.dim}Choose a different name or remove the existing directory.${c.reset}`);
    process.exit(1);
  }

  const schemasDir = join(projectDir, 'schemas');
  mkdirSync(schemasDir, { recursive: true });

  // Write example schemas
  const blogPostSchema = `/**
 * Blog Post content type
 *
 * Edit this file to match your content model, then run:
 *   cms-sim --schemas=schemas/ --open
 */
export default {
  id: 'blogPost',
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'RichText', required: true, localized: true },
    { id: 'excerpt', name: 'Excerpt', type: 'Text', localized: true },
    { id: 'author', name: 'Author', type: 'Link', linkType: 'Entry' },
    { id: 'publishDate', name: 'Publish Date', type: 'Date', required: true },
    { id: 'heroImage', name: 'Hero Image', type: 'Link', linkType: 'Asset' },
    { id: 'category', name: 'Category', type: 'Symbol', validations: [{ in: ['Tech', 'Design', 'Business', 'Lifestyle'] }] },
    { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' } },
    { id: 'relatedPosts', name: 'Related Posts', type: 'Array', items: { type: 'Link', linkType: 'Entry' } },
  ],
};
`;

  const authorSchema = `/**
 * Author content type
 */
export default {
  id: 'author',
  name: 'Author',
  displayField: 'name',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true },
    { id: 'bio', name: 'Bio', type: 'Text', localized: true },
    { id: 'avatar', name: 'Avatar', type: 'Link', linkType: 'Asset' },
    { id: 'email', name: 'Email', type: 'Symbol' },
  ],
};
`;

  const readme = `# ${projectName}

Content model project created with [content-model-simulator](https://github.com/JoshuaPozos/content-model-simulator).

## Quick Start

\`\`\`bash
# Preview your content model (generates mock data automatically)
npx cms-sim --schemas=schemas/ --open

# Preview with multiple locales
npx cms-sim --schemas=schemas/ --locales=en,es,fr --open

# Watch for changes (auto-reload on save)
npx cms-sim --schemas=schemas/ --watch --open

# Validate schemas (CI-friendly)
npx cms-sim validate --schemas=schemas/
\`\`\`

## Adding Content Types

Create a new \`.js\` file in \`schemas/\` with this structure:

\`\`\`js
export default {
  id: 'myContentType',
  name: 'My Content Type',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    // See README for all field types
  ],
};
\`\`\`

## Supported Field Types

| Type | Description |
|------|-------------|
| \`Symbol\` | Short text (max 256 chars) |
| \`Text\` | Long text |
| \`RichText\` | Rich text (Contentful format) |
| \`Integer\` | Whole number |
| \`Number\` | Decimal number |
| \`Date\` | ISO 8601 date |
| \`Boolean\` | True/false |
| \`Object\` | Arbitrary JSON |
| \`Location\` | Lat/lon coordinates |
| \`Link\` | Reference to Entry or Asset (\`linkType: 'Entry'\\|'Asset'\`) |
| \`Array\` | Array of values (\`items: { type: ... }\`) |

## Next Steps

- Edit schemas in \`schemas/\` to match your content model
- Run \`cms-sim --schemas=schemas/ --open\` to preview
- Use \`cms-sim pull --space-id=XXX --access-token=YYY\` to download from an existing Contentful space
- Use \`cms-sim diff --old=schemas-v1/ --new=schemas-v2/\` to compare schema changes
`;

  writeFileSync(join(schemasDir, 'blogPost.js'), blogPostSchema);
  writeFileSync(join(schemasDir, 'author.js'), authorSchema);
  writeFileSync(join(projectDir, 'README.md'), readme);

  console.log(`
${c.green}${c.bold}✓ Project created: ${safeName}/${c.reset}

  ${c.dim}${safeName}/${c.reset}
  ├── schemas/
  │   ├── blogPost.js
  │   └── author.js
  └── README.md

${c.cyan}Next steps:${c.reset}
  cd ${safeName}
  npx cms-sim --schemas=schemas/ --open
`);
}

// ── Entry point ──────────────────────────────────────────────────
const rawArgs = process.argv.slice(2);
const subCommand = rawArgs[0] === 'pull' ? 'pull'
  : rawArgs[0] === 'diff' ? 'diff'
  : rawArgs[0] === 'validate' ? 'validate'
  : rawArgs[0] === 'init' ? 'init'
  : rawArgs[0] === 'scaffold' ? 'scaffold'
  : 'simulate';

if (subCommand === 'pull') {
  pullMain(rawArgs.slice(1)).catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
} else if (subCommand === 'diff') {
  diffMain(rawArgs.slice(1)).catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
} else if (subCommand === 'validate') {
  validateMain(rawArgs.slice(1)).catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
} else if (subCommand === 'scaffold') {
  scaffoldMain(rawArgs.slice(1)).catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
} else if (subCommand === 'init') {
  initMain(rawArgs.slice(1));
} else {
  main().catch(err => {
    console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  });
}
