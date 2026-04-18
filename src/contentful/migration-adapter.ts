/**
 * Content Model Simulator — Contentful Migration Adapter
 *
 * Executes `contentful-migration` scripts with a mock Migration object
 * that captures content type and field definitions. Converts them to
 * cms-sim ContentTypeDefinition schemas — without touching Contentful.
 *
 * Supports both prop-style and fluent-chaining migration APIs:
 *
 *   // Prop-style
 *   const ct = migration.createContentType('blogPost', { name: 'Blog Post' });
 *   ct.createField('title', { name: 'Title', type: 'Symbol', required: true });
 *
 *   // Fluent-chaining
 *   const ct = migration.createContentType('blogPost').name('Blog Post');
 *   ct.createField('title').name('Title').type('Symbol').required(true);
 *
 * Multiple migration files are run in order, accumulating state — so a
 * series of files (create CTs, then add fields, then edit validations)
 * produces the correct final schema.
 *
 * TypeScript migration files (.ts) require the caller to run cms-sim
 * under tsx (e.g. `npx tsx $(which cms-sim) from-migrations ...`).
 * Plain .js/.mjs/.cjs files work with no extra tooling.
 */

import { writeFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, extname, basename, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ContentTypeDefinition, ContentTypeField } from '../types.js';

// ── Field Mock ───────────────────────────────────────────────────

/**
 * Captures field definition calls from a contentful-migration script.
 * Handles both prop-style (`createField('id', { type: 'Symbol' })`)
 * and fluent-chaining (`.type('Symbol').required(true)`).
 */
class FieldMock {
  _id: string;
  _props: Record<string, unknown> = {};

  constructor(id: string, props?: Record<string, unknown>) {
    this._id = id;
    if (props) this._applyProps(props);
  }

  _applyProps(props: Record<string, unknown>): void {
    Object.assign(this._props, props);
  }

  // Fluent setters — all return `this` for chaining
  name(v: string): this { this._props.name = v; return this; }
  type(v: string): this { this._props.type = v; return this; }
  linkType(v: string): this { this._props.linkType = v; return this; }
  items(v: Record<string, unknown>): this { this._props.items = v; return this; }
  required(v: boolean): this { this._props.required = v; return this; }
  localized(v: boolean): this { this._props.localized = v; return this; }
  disabled(v: boolean): this { this._props.disabled = v; return this; }
  omitted(v: boolean): this { this._props.omitted = v; return this; }
  validations(v: unknown[]): this { this._props.validations = v; return this; }
  defaultValue(v: unknown): this { this._props.defaultValue = v; return this; }

  toField(): ContentTypeField {
    const f: ContentTypeField = {
      id: this._id,
      name: (this._props.name as string | undefined) ?? this._id,
      type: (this._props.type as ContentTypeField['type'] | undefined) ?? 'Symbol',
    };
    if (this._props.linkType) f.linkType = this._props.linkType as ContentTypeField['linkType'];
    if (this._props.items) f.items = this._props.items as ContentTypeField['items'];
    if (this._props.required) f.required = true;
    if (this._props.localized) f.localized = true;
    if (this._props.disabled) f.disabled = true;
    if (this._props.omitted) f.omitted = true;
    const validations = this._props.validations as unknown[] | undefined;
    if (validations?.length) f.validations = validations as ContentTypeField['validations'];
    return f;
  }
}

// ── Content Type Mock ────────────────────────────────────────────

/**
 * Captures content type definition calls from a contentful-migration script.
 */
class ContentTypeMock {
  _id: string;
  _props: Record<string, unknown> = {};
  _fields: Map<string, FieldMock> = new Map();

  constructor(id: string, props?: Record<string, unknown>) {
    this._id = id;
    if (props) {
      if (props.name) this._props.name = props.name;
      if (props.displayField) this._props.displayField = props.displayField;
      if (props.description) this._props.description = props.description;
    }
  }

  // Overloaded — setter if arg provided, getter if not (matches real contentful-migration API)
  name(v?: string): this | string {
    if (v !== undefined) { this._props.name = v; return this; }
    return (this._props.name as string | undefined) ?? this._id;
  }

  displayField(v?: string): this | string | undefined {
    if (v !== undefined) { this._props.displayField = v; return this; }
    return this._props.displayField as string | undefined;
  }

  description(v?: string): this | string | undefined {
    if (v !== undefined) { this._props.description = v; return this; }
    return this._props.description as string | undefined;
  }

  createField(id: string, props?: Record<string, unknown>): FieldMock {
    const field = new FieldMock(id, props);
    this._fields.set(id, field);
    return field;
  }

  editField(id: string, props?: Record<string, unknown>): FieldMock {
    let field = this._fields.get(id);
    if (!field) {
      field = new FieldMock(id, props);
      this._fields.set(id, field);
    } else if (props) {
      field._applyProps(props);
    }
    return field;
  }

  deleteField(id: string): this {
    this._fields.delete(id);
    return this;
  }

  changeFieldId(oldId: string, newId: string): this {
    const field = this._fields.get(oldId);
    if (field) {
      field._id = newId;
      this._fields.delete(oldId);
      this._fields.set(newId, field);
    }
    return this;
  }

  moveField(_id: string): { beforeField: () => ContentTypeMock; afterField: () => ContentTypeMock; toTheTop: () => ContentTypeMock; toTheBottom: () => ContentTypeMock } {
    // Field ordering is captured from insertion order in _fields Map.
    // moveField is a no-op for schema extraction purposes.
    return {
      beforeField: () => this,
      afterField: () => this,
      toTheTop: () => this,
      toTheBottom: () => this,
    };
  }

  toSchema(): ContentTypeDefinition {
    return {
      id: this._id,
      name: ((this._props.name as string | undefined) ?? this._id),
      ...(this._props.description ? { description: this._props.description as string } : {}),
      ...(this._props.displayField ? { displayField: this._props.displayField as string } : {}),
      fields: [...this._fields.values()].map(f => f.toField()),
    };
  }
}

// ── Migration Mock ───────────────────────────────────────────────

/**
 * Top-level mock passed to each migration function.
 * Collects createContentType / editContentType / deleteContentType calls.
 * Data-transformation calls (transformEntries, etc.) are silently ignored.
 */
export class MigrationMock {
  _contentTypes: Map<string, ContentTypeMock> = new Map();

  createContentType(id: string, props?: Record<string, unknown>): ContentTypeMock {
    // If already created (e.g., two files create same CT), return existing
    if (!this._contentTypes.has(id)) {
      this._contentTypes.set(id, new ContentTypeMock(id, props));
    } else if (props) {
      const ct = this._contentTypes.get(id)!;
      if (props.name) ct._props.name = props.name;
      if (props.displayField) ct._props.displayField = props.displayField;
      if (props.description) ct._props.description = props.description;
    }
    return this._contentTypes.get(id)!;
  }

  editContentType(id: string, props?: Record<string, unknown>): ContentTypeMock {
    let ct = this._contentTypes.get(id);
    if (!ct) {
      // editContentType on an unknown CT is valid when building from multiple files
      ct = new ContentTypeMock(id, props);
      this._contentTypes.set(id, ct);
    } else if (props) {
      if (props.name) ct._props.name = props.name;
      if (props.displayField) ct._props.displayField = props.displayField;
      if (props.description) ct._props.description = props.description;
    }
    return ct;
  }

  deleteContentType(id: string): void {
    this._contentTypes.delete(id);
  }

  // ── No-ops: data transformations don't affect the content model ──
  transformEntries(): void {}
  transformEntriesToType(): void {}
  deriveLinkedEntries(): void {}

  getSchemas(): ContentTypeDefinition[] {
    return [...this._contentTypes.values()].map(ct => ct.toSchema());
  }
}

// ── File Loader ──────────────────────────────────────────────────

type MigrationFn = (migration: MigrationMock, context?: Record<string, unknown>) => void | Promise<void>;

async function loadMigrationFn(filePath: string): Promise<MigrationFn> {
  const ext = extname(filePath).toLowerCase();

  if (ext === '.ts') {
    // TypeScript files work only when cms-sim is run under tsx:
    //   npx tsx $(which cms-sim) from-migrations ...
    // tsx registers an ESM loader that makes import() handle .ts files.
    try {
      const mod = await import(pathToFileURL(filePath).href) as Record<string, unknown>;
      const fn = (mod.default ?? mod) as MigrationFn;
      if (typeof fn !== 'function') {
        throw new Error(`Migration file does not export a function: ${basename(filePath)}`);
      }
      return fn;
    } catch (err: any) {
      if (err.code === 'ERR_UNKNOWN_FILE_EXTENSION' || String(err.message).includes('Unknown file extension')) {
        throw new Error(
          `Cannot load TypeScript migration file without tsx.\n` +
          `Run cms-sim under tsx:\n\n` +
          `  npx tsx $(which cms-sim) from-migrations ...\n\n` +
          `Or compile your migrations first:\n` +
          `  npx tsc --outDir ./migrations-compiled/ --module esnext --target esnext <files>\n` +
          `  cms-sim from-migrations ./migrations-compiled/ --output ./schemas/`,
        );
      }
      throw err;
    }
  }

  // .js / .mjs / .cjs — dynamic import handles both ESM and CJS modules
  const mod = await import(pathToFileURL(filePath).href) as Record<string, unknown>;
  const fn = (mod.default ?? mod) as MigrationFn;
  if (typeof fn !== 'function') {
    throw new Error(`Migration file does not export a function: ${basename(filePath)}`);
  }
  return fn;
}

// ── Public API ───────────────────────────────────────────────────

export interface FromMigrationsOptions {
  /** Absolute paths to migration files, processed in array order. */
  files: string[];
  /** Print each file being loaded. Default: false. */
  verbose?: boolean;
}

export interface FromMigrationsResult {
  /** Final accumulated content type schemas. */
  schemas: ContentTypeDefinition[];
  /** Paths of successfully executed migration files, in order. */
  filesProcessed: string[];
  /** Non-fatal warnings (e.g., a file was skipped due to an error). */
  warnings: string[];
}

/**
 * Execute one or more contentful-migration scripts with a mock migration
 * object and return the captured ContentTypeDefinition schemas.
 *
 * Processes files in order, accumulating state — useful for a series of
 * migration files where later files edit content types created by earlier ones.
 *
 * @example
 * import { fromMigrations } from 'content-model-simulator';
 *
 * const { schemas, warnings } = await fromMigrations({
 *   files: ['./migrations/01-create-content-types.js', './migrations/02-add-fields.js'],
 * });
 */
export async function fromMigrations(options: FromMigrationsOptions): Promise<FromMigrationsResult> {
  const { files, verbose = false } = options;
  const mock = new MigrationMock();
  const warnings: string[] = [];
  const filesProcessed: string[] = [];

  for (const filePath of files) {
    if (verbose) console.log(`  Loading: ${basename(filePath)}`);
    try {
      const fn = await loadMigrationFn(filePath);
      await fn(mock, {});
      filesProcessed.push(filePath);
    } catch (err: any) {
      const msg = `[${basename(filePath)}] ${err.message as string}`;
      warnings.push(msg);
      if (verbose) console.warn(`  ⚠  Skipped: ${msg}`);
    }
  }

  return { schemas: mock.getSchemas(), filesProcessed, warnings };
}

/**
 * Execute a single contentful-migration script and return its schemas.
 * Throws on error (including the helpful tsx message for .ts files).
 */
export async function fromMigration(filePath: string): Promise<ContentTypeDefinition[]> {
  const result = await fromMigrations({ files: [filePath] });
  if (result.warnings.length) throw new Error(result.warnings[0]);
  return result.schemas;
}

/**
 * Write ContentTypeDefinition schemas to a directory as cms-sim .js files.
 * Returns the list of written file paths.
 */
export function writeMigrationSchemas(schemas: ContentTypeDefinition[], outputDir: string): string[] {
  mkdirSync(outputDir, { recursive: true });
  const written: string[] = [];
  for (const schema of schemas) {
    const safeId = schema.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = join(outputDir, `${safeId}.js`);
    const content =
      `/** @type {import('content-model-simulator').ContentTypeDefinition} */\n` +
      `export default ${JSON.stringify(schema, null, 2)};\n`;
    writeFileSync(filePath, content, 'utf-8');
    written.push(filePath);
  }
  return written;
}

/**
 * Discover migration files in a directory, sorted by filename
 * (so 001-create.ts runs before 002-add-fields.ts).
 * Returns absolute paths.
 */
export function discoverMigrationFiles(dir: string): string[] {
  const MIGRATION_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts']);
  const realDir = realpathSync(dir);
  return readdirSync(realDir)
    .filter(f => MIGRATION_EXTS.has(extname(f).toLowerCase()))
    .sort()
    .map(f => {
      const full = join(realDir, f);
      // Verify each resolved path stays within the directory (prevents symlink escape)
      const realFull = realpathSync(full);
      if (!realFull.startsWith(realDir + sep) && realFull !== realDir) {
        throw new Error(`Security: ${f} resolves outside the migrations directory`);
      }
      return realFull;
    });
}
