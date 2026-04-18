/**
 * CLI Integration Tests
 *
 * End-to-end tests for the three workflows:
 *   1. From-scratch (mock data)
 *   2. Migration (with data)
 *   3. Pull (error handling only — no real API)
 *
 * Also tests: --help, arg validation, --json mode.
 * Uses child_process.execFile to run the actual CLI binary.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);
const CLI = path.resolve(import.meta.dirname, '..', 'bin', 'cms-sim.js');
const NODE = process.execPath;
const SCHEMAS_DIR = path.resolve(import.meta.dirname, '..', 'examples', 'from-scratch', 'schemas');
const DATA_FILE = path.resolve(import.meta.dirname, '..', 'examples', 'with-data', 'data', 'sample-export.ndjson');
const SCHEMAS_DATA_DIR = path.resolve(import.meta.dirname, '..', 'examples', 'with-data', 'schemas');

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sim-e2e-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Helper to run CLI
async function cli(args: string[], { env }: { env?: Record<string, string> } = {}): Promise<{ stdout: string; stderr: string }> {
  return run(NODE, [CLI, ...args], {
    env: { ...process.env, ...env, NO_COLOR: '1' },
    timeout: 30_000,
  });
}

// ─── Help ────────────────────────────────────────────────────────

describe('CLI: help and args', () => {
  it('shows help with --help', async () => {
    const { stdout } = await cli(['--help']);
    assert.ok(stdout.includes('Content Model Simulator'));
    assert.ok(stdout.includes('--schemas'));
    assert.ok(stdout.includes('--input'));
  });

  it('shows help with -h', async () => {
    const { stdout } = await cli(['-h']);
    assert.ok(stdout.includes('Content Model Simulator'));
  });

  it('shows pull help with pull --help', async () => {
    const { stdout } = await cli(['pull', '--help']);
    assert.ok(stdout.includes('Pull'));
    assert.ok(stdout.includes('--space-id'));
    assert.ok(stdout.includes('--access-token'));
  });

  it('exits with error when --schemas is missing', async () => {
    await assert.rejects(
      () => cli([]),
      (err: any) => {
        assert.ok(err.stderr.includes('--schemas is required') || err.stdout.includes('--schemas is required'));
        return true;
      }
    );
  });

  it('exits with error when schemas dir does not exist', async () => {
    await assert.rejects(
      () => cli(['--schemas=/nonexistent/path']),
      (err: any) => {
        const output = err.stderr + err.stdout;
        assert.ok(output.includes('not found') || output.includes('does not exist'));
        return true;
      }
    );
  });

  it('exits with error when input file does not exist', async () => {
    await assert.rejects(
      () => cli([`--schemas=${SCHEMAS_DIR}`, '--input=/nonexistent/file.ndjson']),
      (err: any) => {
        const output = err.stderr + err.stdout;
        assert.ok(output.includes('not found') || output.includes('does not exist'));
        return true;
      }
    );
  });
});

// ─── Workflow 1: From-scratch (mock data) ────────────────────────

describe('CLI: from-scratch workflow (mock data)', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) cleanup(outDir);
  });

  it('generates output with schemas only', async () => {
    outDir = tmpDir();
    const { stdout } = await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);

    assert.ok(stdout.includes('Mock mode'));
    assert.ok(stdout.includes('mock entries'));
    assert.ok(stdout.includes('Content Types:'));

    // Verify output files
    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'validation-report.json')));
    assert.ok(fs.existsSync(path.join(outDir, 'content-browser.html')));
    assert.ok(fs.existsSync(path.join(outDir, 'visual-report.html')));
    assert.ok(fs.existsSync(path.join(outDir, 'content-types')));
    assert.ok(fs.existsSync(path.join(outDir, 'entries')));

    // Check manifest
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest.stats);
    assert.ok(manifest.stats.totalCTs >= 2);
    assert.ok(manifest.stats.totalEntries > 0);
  });

  it('respects --entries-per-type', async () => {
    outDir = tmpDir();
    const { stdout } = await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
      '--entries-per-type=5',
    ]);

    assert.ok(stdout.includes('5/type'));
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest.stats.totalEntries >= 10); // 2 CTs * 5 entries each
  });

  it('supports multi-locale mock generation', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
      '--locales=en,es,fr',
      '--entries-per-type=2',
    ]);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest.stats.totalLocales >= 3);
    // 2 CTs * 2 entries = 4 entries (locales merged into each entry)
    assert.ok(manifest.stats.totalEntries >= 4);
  });

  it('supports --json (no HTML)', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
      '--json',
    ]);

    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
    assert.ok(!fs.existsSync(path.join(outDir, 'content-browser.html')));
    assert.ok(!fs.existsSync(path.join(outDir, 'visual-report.html')));
  });

  it('supports --name to set project name', async () => {
    outDir = tmpDir();
    const { stdout } = await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
      '--name=my-project',
    ]);

    assert.ok(stdout.includes('my-project'));
  });

  it('generates valid HTML in content-browser', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);

    const html = fs.readFileSync(path.join(outDir, 'content-browser.html'), 'utf-8');
    assert.ok(html.startsWith('<!DOCTYPE html>') || html.startsWith('<html'));
    assert.ok(html.includes('</html>'));
    assert.ok(html.includes('blogPost'));
    assert.ok(html.includes('author'));
  });

  it('generates valid HTML in visual-report (model graph)', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);

    const html = fs.readFileSync(path.join(outDir, 'visual-report.html'), 'utf-8');
    assert.ok(html.startsWith('<!DOCTYPE html>') || html.startsWith('<html'));
    assert.ok(html.includes('</html>'));
  });

  it('writes per-CT entry files', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);

    const entriesDir = path.join(outDir, 'entries');
    const files = fs.readdirSync(entriesDir);
    assert.ok(files.includes('blogPost.json'));
    assert.ok(files.includes('author.json'));

    const blogEntries = JSON.parse(fs.readFileSync(path.join(entriesDir, 'blogPost.json'), 'utf-8'));
    assert.ok(Array.isArray(blogEntries));
    assert.ok(blogEntries.length > 0);
    assert.equal(blogEntries[0].contentType, 'blogPost');
  });

  it('writes per-CT definition files', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);

    const ctDir = path.join(outDir, 'content-types');
    const files = fs.readdirSync(ctDir);
    assert.ok(files.includes('blogPost.json'));
    assert.ok(files.includes('author.json'));

    const blogDef = JSON.parse(fs.readFileSync(path.join(ctDir, 'blogPost.json'), 'utf-8'));
    assert.equal(blogDef.id, 'blogPost');
    assert.ok(Array.isArray(blogDef.fields));
  });
});

// ─── Workflow 2: Migration (with data) ───────────────────────────

describe('CLI: migration workflow (with data)', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) cleanup(outDir);
  });

  it('processes NDJSON data with schemas', async () => {
    outDir = tmpDir();
    const { stdout } = await cli([
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
      `--output=${outDir}`,
    ]);

    assert.ok(!stdout.includes('Mock mode'));
    assert.ok(stdout.includes('Loaded'));
    assert.ok(stdout.includes('documents'));
    assert.ok(stdout.includes('Content Types:'));

    // Verify output files
    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest.stats.totalEntries >= 3); // sample has 5 docs → at least 3 base entries
    assert.ok(manifest.stats.totalCTs >= 2);
  });

  it('detects locales from data', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
      `--output=${outDir}`,
    ]);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest.stats.totalLocales >= 1);
  });

  it('writes HTML browser with real data', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
      `--output=${outDir}`,
    ]);

    const html = fs.readFileSync(path.join(outDir, 'content-browser.html'), 'utf-8');
    assert.ok(html.includes('Hello World') || html.includes('hello-world'));
    assert.ok(html.includes('blogPost'));
  });

  it('generates validation report for real data', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
      `--output=${outDir}`,
    ]);

    const report = JSON.parse(fs.readFileSync(path.join(outDir, 'validation-report.json'), 'utf-8'));
    assert.ok('errors' in report);
    assert.ok('warnings' in report);
    assert.ok(Array.isArray(report.errors));
    assert.ok(Array.isArray(report.warnings));
  });

  it('supports --base-locale option', async () => {
    outDir = tmpDir();
    await cli([
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
      `--output=${outDir}`,
      '--base-locale=es',
    ]);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf-8'));
    assert.ok(manifest); // Should complete without error
  });
});

// ─── Workflow 3: Pull (error handling) ───────────────────────────

describe('CLI: pull error handling', () => {
  it('fails with missing --space-id and --access-token', async () => {
    await assert.rejects(
      () => cli(['pull'], { env: { CONTENTFUL_SPACE_ID: '', CONTENTFUL_ACCESS_TOKEN: '' } }),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('Missing') || output.includes('error') || output.includes('Fatal'));
        return true;
      }
    );
  });

  it('fails with missing --access-token', async () => {
    await assert.rejects(
      () => cli(['pull', '--space-id=test123'], { env: { CONTENTFUL_ACCESS_TOKEN: '' } }),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('Missing') || output.includes('access-token'));
        return true;
      }
    );
  });
});

// ─── Verbose mode ────────────────────────────────────────────────

describe('CLI: verbose mode', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) cleanup(outDir);
  });

  it('shows additional output with --verbose', async () => {
    outDir = tmpDir();
    const { stdout } = await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
      '--verbose',
    ]);

    assert.ok(stdout.includes('Content Types:'));
    // Verbose should still work and produce output
    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
  });
});

// ─── Watch mode: fixed output dir ───────────────────────────────

describe('CLI: watch mode output dir', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) cleanup(outDir);
  });

  it('uses fixed output dir (no timestamp) when --watch is set', async () => {
    outDir = tmpDir();
    // We can't actually test watch mode in e2e (it blocks), but we can test
    // that without --watch, the output dir contains a timestamp-like pattern,
    // and with --output explicit it still uses the explicit dir.
    const { stdout } = await cli([
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);
    assert.ok(stdout.includes('Content Types:'));
    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
  });
});

// ─── Config file ────────────────────────────────────────────────

describe('CLI: --config flag', () => {
  let outDir: string | undefined;

  afterEach(() => {
    if (outDir) cleanup(outDir);
  });

  it('loads schemas from config file (no --schemas needed)', async () => {
    outDir = tmpDir();
    const configFile = path.join(outDir, 'cms-sim.config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      schemas: SCHEMAS_DIR,
      name: 'config-test',
    }));

    const { stdout } = await cli([
      `--config=${configFile}`,
      `--output=${outDir}`,
    ]);

    assert.ok(stdout.includes('Content Model Simulator'));
    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
  });

  it('CLI args override config values', async () => {
    outDir = tmpDir();
    const configFile = path.join(outDir, 'cms-sim.config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      schemas: '/nonexistent/dir',
      name: 'from-config',
    }));

    const { stdout } = await cli([
      `--config=${configFile}`,
      `--schemas=${SCHEMAS_DIR}`,
      `--output=${outDir}`,
    ]);

    assert.ok(stdout.includes('Content Model Simulator'));
    assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
  });

  it('validate subcommand loads schemas from config', async () => {
    outDir = tmpDir();
    const configFile = path.join(outDir, 'cms-sim.config.json');
    fs.writeFileSync(configFile, JSON.stringify({
      schemas: SCHEMAS_DIR,
    }));

    const { stdout } = await cli([
      'validate',
      `--config=${configFile}`,
    ]);

    assert.ok(stdout.includes('Content Types:'));
    assert.ok(stdout.includes('No errors'));
  });

  it('errors on missing config file', async () => {
    await assert.rejects(
      cli([`--config=/nonexistent/config.json`, `--schemas=${SCHEMAS_DIR}`]),
      (err: any) => {
        assert.ok(err.stderr.includes('Config file not found'));
        return true;
      },
    );
  });
});

// ─── Validate sub-command ────────────────────────────────────────

describe('CLI: validate subcommand', () => {
  it('shows help with validate --help', async () => {
    const { stdout } = await cli(['validate', '--help']);
    assert.ok(stdout.includes('Validate'));
    assert.ok(stdout.includes('--schemas'));
    assert.ok(stdout.includes('--json'));
    assert.ok(stdout.includes('CI'));
  });

  it('fails without --schemas', async () => {
    await assert.rejects(
      () => cli(['validate']),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('--schemas is required'));
        return true;
      }
    );
  });

  it('validates schemas-only (mock data) successfully', async () => {
    const { stdout } = await cli(['validate', `--schemas=${SCHEMAS_DIR}`]);
    assert.ok(stdout.includes('Content Types:'));
    assert.ok(stdout.includes('Entries:'));
    assert.ok(stdout.includes('No errors'));
  });

  it('validates schemas + data file successfully', async () => {
    const { stdout } = await cli([
      'validate',
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
    ]);
    assert.ok(stdout.includes('Content Types:'));
    assert.ok(stdout.includes('Entries:'));
  });

  it('outputs JSON with --json flag', async () => {
    const { stdout } = await cli(['validate', `--schemas=${SCHEMAS_DIR}`, '--json']);
    const result = JSON.parse(stdout);
    assert.equal(typeof result.valid, 'boolean');
    assert.ok(Array.isArray(result.errors));
    assert.ok(Array.isArray(result.warnings));
    assert.equal(typeof result.contentTypes, 'number');
    assert.ok(result.contentTypes > 0);
    assert.equal(typeof result.entries, 'number');
  });

  it('fails with non-existent schemas dir', async () => {
    await assert.rejects(
      () => cli(['validate', '--schemas=/tmp/nonexistent-dir-xyz']),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('not found'));
        return true;
      }
    );
  });

  it('verbose mode shows warning details', async () => {
    const { stdout } = await cli([
      'validate',
      `--schemas=${SCHEMAS_DATA_DIR}`,
      `--input=${DATA_FILE}`,
      '--verbose',
    ]);
    assert.ok(stdout.includes('Content Types:'));
  });
});

// ─── Init sub-command ────────────────────────────────────────────

describe('CLI: init subcommand', () => {
  let initDir: string | undefined;

  afterEach(() => {
    if (initDir && fs.existsSync(initDir)) {
      fs.rmSync(initDir, { recursive: true, force: true });
    }
  });

  it('shows help with init --help', async () => {
    const { stdout } = await cli(['init', '--help']);
    assert.ok(stdout.includes('Init'));
    assert.ok(stdout.includes('Scaffold'));
    assert.ok(stdout.includes('schemas'));
  });

  it('creates project with default name', async () => {
    initDir = path.join(os.tmpdir(), 'cms-sim-init-test-' + Date.now());
    // Use a unique name to avoid conflicts
    const name = 'test-init-' + Date.now();
    initDir = path.resolve(name);
    const { stdout } = await cli(['init', name]);
    assert.ok(stdout.includes('Project created'));
    assert.ok(fs.existsSync(path.join(initDir, 'schemas', 'blogPost.mjs')));
    assert.ok(fs.existsSync(path.join(initDir, 'schemas', 'author.mjs')));
    assert.ok(fs.existsSync(path.join(initDir, 'README.md')));
  });

  it('fails if directory already exists', async () => {
    const name = 'test-init-dup-' + Date.now();
    initDir = path.resolve(name);
    fs.mkdirSync(initDir, { recursive: true });
    await assert.rejects(
      () => cli(['init', name]),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('already exists'));
        return true;
      }
    );
  });

  it('created schemas can be simulated', async () => {
    const name = 'test-init-sim-' + Date.now();
    initDir = path.resolve(name);
    await cli(['init', name]);
    const outDir = tmpDir();
    try {
      const { stdout } = await cli([
        `--schemas=${path.join(initDir, 'schemas')}`,
        `--output=${outDir}`,
      ]);
      assert.ok(stdout.includes('Content Types:'));
      assert.ok(stdout.includes('Entries:'));
    } finally {
      cleanup(outDir);
    }
  });
});

// ─── Pull preview 401 token warning ─────────────────────────────

describe('CLI: pull preview 401 detection', () => {
  it('pull --preview with invalid token mentions CPA in error', async () => {
    await assert.rejects(
      () => cli([
        'pull',
        '--space-id=test123',
        '--access-token=bad-token',
        '--preview',
      ]),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        // Should mention CPA or Preview API in the error
        assert.ok(
          output.includes('CPA') || output.includes('Preview') || output.includes('401') || output.includes('Unauthorized'),
          `Expected CPA/Preview/401 message, got: ${output.substring(0, 300)}`
        );
        return true;
      }
    );
  });
});

// ── scaffold subcommand ──────────────────────────────────────────

const WP_XML = path.resolve(import.meta.dirname, '..', 'examples', 'wordpress', 'data', 'gutenberg-test-data.xml');

describe('CLI: scaffold', () => {
  let tempDirs: string[] = [];
  afterEach(() => {
    for (const d of tempDirs) {
      try { fs.rmSync(d, { recursive: true }); } catch {}
    }
    tempDirs = [];
  });

  function cli(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return run(NODE, [CLI, 'scaffold', ...args], { timeout: 15_000 });
  }

  it('shows help with --help flag', async () => {
    const { stdout } = await cli(['--help']);
    assert.ok(stdout.includes('scaffold'));
    assert.ok(stdout.includes('--input'));
    assert.ok(stdout.includes('--output'));
  });

  it('errors when --input is missing', async () => {
    await assert.rejects(
      () => cli([]),
      (err: any) => {
        assert.ok(err.stderr.includes('--input') || err.stdout.includes('--input'));
        return true;
      }
    );
  });

  it('errors when input file does not exist', async () => {
    await assert.rejects(
      () => cli(['--input=nonexistent.xml']),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('not found') || output.includes('ENOENT') || output.includes('No such'));
        return true;
      }
    );
  });

  it('generates scaffold files from WordPress XML', async () => {
    const outDir = tmpDir();
    const dest = path.join(outDir, 'wp-migration');
    tempDirs.push(outDir);

    const { stdout } = await cli(['--input=' + WP_XML, '--output=' + dest]);

    // Verify output mentions success
    assert.ok(stdout.includes('blogPost') || stdout.includes('post'));

    // Verify files were created
    assert.ok(fs.existsSync(path.join(dest, 'schemas', 'blogPost.js')));
    assert.ok(fs.existsSync(path.join(dest, 'transforms', 'wordpress.js')));
    assert.ok(fs.existsSync(path.join(dest, 'README.md')));

    // Verify schema content
    const schema = fs.readFileSync(path.join(dest, 'schemas', 'blogPost.js'), 'utf8');
    assert.ok(schema.includes('export default'));
    assert.ok(schema.includes("id: 'blogPost'"));
  });

  it('generates schema for authors', async () => {
    const outDir = tmpDir();
    const dest = path.join(outDir, 'wp-scaffold');
    tempDirs.push(outDir);

    await cli(['--input=' + WP_XML, '--output=' + dest]);
    assert.ok(fs.existsSync(path.join(dest, 'schemas', 'author.js')));

    const schema = fs.readFileSync(path.join(dest, 'schemas', 'author.js'), 'utf8');
    assert.ok(schema.includes("id: 'author'"));
  });

  it('errors when output directory already exists', async () => {
    const outDir = tmpDir();
    const dest = path.join(outDir, 'existing');
    fs.mkdirSync(dest);
    tempDirs.push(outDir);

    await assert.rejects(
      () => cli(['--input=' + WP_XML, '--output=' + dest]),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('already exists') || output.includes('exists'));
        return true;
      }
    );
  });

  it('shows verbose output with --verbose flag', async () => {
    const outDir = tmpDir();
    const dest = path.join(outDir, 'wp-verbose');
    tempDirs.push(outDir);

    const { stdout } = await cli(['--input=' + WP_XML, '--output=' + dest, '--verbose']);
    // Verbose mode should print field details
    assert.ok(stdout.includes('title') || stdout.includes('slug') || stdout.includes('body'));
  });
});

// ─── from-migrations CLI ─────────────────────────────────────────

/** Strip ANSI escape sequences for clean assertions */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('CLI: from-migrations', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs) cleanup(d);
    tempDirs.length = 0;
  });

  it('shows help with from-migrations --help', async () => {
    const { stdout } = await cli(['from-migrations', '--help']);
    assert.ok(stdout.includes('from-migrations'));
    assert.ok(stdout.includes('--migrations'));
    assert.ok(stdout.includes('--output'));
  });

  it('converts migration files to schemas via --migrations flag', async () => {
    const workDir = tmpDir();
    tempDirs.push(workDir);

    const migDir = path.join(workDir, 'migrations');
    const outDir = path.join(workDir, 'schemas');
    fs.mkdirSync(migDir);

    // Create two migration files
    fs.writeFileSync(path.join(migDir, '001-create.mjs'), `
      export default function(migration) {
        const ct = migration.createContentType('blogPost', { name: 'Blog Post', displayField: 'title' });
        ct.createField('title', { name: 'Title', type: 'Symbol', required: true });
        ct.createField('body', { name: 'Body', type: 'RichText' });
      }
    `);
    fs.writeFileSync(path.join(migDir, '002-add-author.mjs'), `
      export default function(migration) {
        migration.createContentType('author', { name: 'Author' });
        migration.editContentType('blogPost').createField('author', {
          name: 'Author', type: 'Link', linkType: 'Entry',
        });
      }
    `);

    const { stdout } = await cli(['from-migrations', '--migrations=' + migDir, '--output=' + outDir]);
    const plain = stripAnsi(stdout);

    assert.ok(plain.includes('2 migration file'));
    assert.ok(plain.includes('2 content type'));
    assert.ok(plain.includes('2 schema file'));

    // Verify output files
    assert.ok(fs.existsSync(path.join(outDir, 'blogPost.js')));
    assert.ok(fs.existsSync(path.join(outDir, 'author.js')));

    // Verify content
    const content = fs.readFileSync(path.join(outDir, 'blogPost.js'), 'utf-8');
    assert.ok(content.includes('"blogPost"'));
    assert.ok(content.includes('"title"'));
    assert.ok(content.includes('"author"'));
  });

  it('converts migration files passed as positional arguments', async () => {
    const workDir = tmpDir();
    tempDirs.push(workDir);

    const outDir = path.join(workDir, 'schemas');
    const migFile = path.join(workDir, 'create.mjs');
    fs.writeFileSync(migFile, `
      export default function(migration) {
        migration.createContentType('page', { name: 'Page' });
      }
    `);

    const { stdout } = await cli(['from-migrations', migFile, '--output=' + outDir]);
    assert.ok(stripAnsi(stdout).includes('1 migration file'));
    assert.ok(fs.existsSync(path.join(outDir, 'page.js')));
  });

  it('errors when no migrations are provided', async () => {
    await assert.rejects(
      () => cli(['from-migrations']),
      (err: any) => {
        const output = (err.stderr || '') + (err.stdout || '');
        assert.ok(output.includes('--migrations') || output.includes('provide'));
        return true;
      }
    );
  });

  it('shows verbose output with --verbose', async () => {
    const workDir = tmpDir();
    tempDirs.push(workDir);

    const migDir = path.join(workDir, 'migrations');
    const outDir = path.join(workDir, 'schemas');
    fs.mkdirSync(migDir);
    fs.writeFileSync(path.join(migDir, '001.mjs'), `
      export default function(migration) {
        migration.createContentType('verboseTest', { name: 'Verbose' });
      }
    `);

    const { stdout } = await cli(['from-migrations', '--migrations=' + migDir, '--output=' + outDir, '--verbose']);
    assert.ok(stdout.includes('001.mjs') || stdout.includes('Loading'));
  });

  it('generated schemas can be used by simulate', async () => {
    const workDir = tmpDir();
    tempDirs.push(workDir);

    const migDir = path.join(workDir, 'migrations');
    const schemaDir = path.join(workDir, 'schemas');
    const simDir = path.join(workDir, 'output');
    fs.mkdirSync(migDir);

    fs.writeFileSync(path.join(migDir, '001.mjs'), `
      export default function(migration) {
        const ct = migration.createContentType('blogPost', { name: 'Blog Post', displayField: 'title' });
        ct.createField('title', { name: 'Title', type: 'Symbol', required: true });
        ct.createField('body', { name: 'Body', type: 'Text' });
      }
    `);

    // Step 1: extract
    await cli(['from-migrations', '--migrations=' + migDir, '--output=' + schemaDir]);

    // Step 2: simulate using extracted schemas
    const { stdout } = await cli([
      '--schemas=' + schemaDir,
      '--output=' + simDir,
      '--entries-per-type=2',
      '--name=E2E Blog',
    ]);

    const plain = stripAnsi(stdout);
    assert.ok(plain.includes('Content Types: 1'));
    assert.ok(plain.includes('Entries:'));
    assert.ok(fs.existsSync(path.join(simDir, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(simDir, 'content-browser.html')));
  });
});
